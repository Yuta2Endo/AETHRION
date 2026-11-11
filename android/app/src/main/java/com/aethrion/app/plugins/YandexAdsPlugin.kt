package com.aethrion.app.plugins

import android.app.Activity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.yandex.mobile.ads.common.AdError
import com.yandex.mobile.ads.common.AdRequestConfiguration
import com.yandex.mobile.ads.common.AdRequestError
import com.yandex.mobile.ads.common.ImpressionData
import com.yandex.mobile.ads.common.MobileAds
import com.yandex.mobile.ads.rewarded.Reward
import com.yandex.mobile.ads.rewarded.RewardedAd
import com.yandex.mobile.ads.rewarded.RewardedAdEventListener
import com.yandex.mobile.ads.rewarded.RewardedAdLoadListener
import com.yandex.mobile.ads.rewarded.RewardedAdLoader
import java.util.UUID

@CapacitorPlugin(name = "YandexAds")
class YandexAdsPlugin : Plugin() {

    private var initialized = false
    private var adsMode: String = "development"
    private var rewardedAdLoader: RewardedAdLoader? = null
    private var rewardedAd: RewardedAd? = null
    private var isLoading = false
    private var isShowing = false
    private var rewardedForCurrentShow = false
    private var pendingShowCall: PluginCall? = null
    private var pendingLoadCall: PluginCall? = null
    private var activeShowToken: String? = null

    @PluginMethod
    fun initialize(call: PluginCall) {
        val mode = call.getString("mode") ?: "development"
        val adUnitId = call.getString("adUnitId")

        adsMode = mode
        if (mode == "production" && adUnitId.isNullOrBlank()) {
            call.reject("Yandex Ads production mode requires a configured ad unit ID.")
            return
        }

        try {
            val ctx = context.applicationContext
            MobileAds.initialize(ctx) {
                initialized = true
                activity?.runOnUiThread {
                    ensureLoader()
                    call.resolve()
                } ?: call.resolve()
            }
        } catch (e: Exception) {
            call.reject("Failed to initialize Yandex Mobile Ads: ${e.message}", e)
        }
    }

    private fun ensureLoader(): RewardedAdLoader {
        val existing = rewardedAdLoader
        if (existing != null) return existing
        val loader = RewardedAdLoader(context.applicationContext)
        loader.setAdLoadListener(object : RewardedAdLoadListener {
            override fun onAdLoaded(ad: RewardedAd) {
                rewardedAd = ad
                isLoading = false
                val loadCall = pendingLoadCall
                pendingLoadCall = null
                loadCall?.resolve()
            }

            override fun onAdFailedToLoad(error: AdRequestError) {
                rewardedAd = null
                isLoading = false
                val loadCall = pendingLoadCall
                pendingLoadCall = null
                loadCall?.reject("Failed to load rewarded ad: ${error.description} (${error.code})")
            }
        })
        rewardedAdLoader = loader
        return loader
    }

    @PluginMethod
    fun loadRewarded(call: PluginCall) {
        val adUnitId = call.getString("adUnitId")
        if (adUnitId.isNullOrBlank()) {
            call.reject("Missing rewarded ad unit ID.")
            return
        }
        if (!initialized) {
            call.reject("Yandex Ads SDK is not initialized.")
            return
        }
        if (isLoading || isShowing || pendingLoadCall != null || pendingShowCall != null) {
            call.reject("A rewarded ad operation is already in progress.")
            return
        }

        try {
            val loader = ensureLoader()
            isLoading = true
            rewardedAd = null
            pendingLoadCall = call
            val config = AdRequestConfiguration.Builder(adUnitId).build()
            loader.loadAd(config)
            // Resolve/reject in load listener callbacks.
        } catch (e: Exception) {
            isLoading = false
            pendingLoadCall = null
            rewardedAd = null
            call.reject("Failed to load rewarded ad: ${e.message}", e)
        }
    }

    @PluginMethod
    fun showRewarded(call: PluginCall) {
        val act: Activity? = activity
        if (act == null) {
            call.reject("Activity unavailable.")
            return
        }
        if (isShowing || pendingShowCall != null || isLoading) {
            call.reject("A rewarded ad operation is already in progress.")
            return
        }
        val ad = rewardedAd
        if (ad == null) {
            call.reject("Rewarded ad is not ready.")
            return
        }

        isShowing = true
        rewardedForCurrentShow = false
        pendingShowCall = call
        activeShowToken = UUID.randomUUID().toString()
        val showToken = activeShowToken

        ad.setAdEventListener(object : RewardedAdEventListener {
            override fun onAdShown() {
                // no-op
            }

            override fun onAdFailedToShow(adError: AdError) {
                if (activeShowToken != showToken) return
                finishShow(null, "Failed to show rewarded ad: ${adError.description}")
            }

            override fun onAdDismissed() {
                if (activeShowToken != showToken) return
                if (!rewardedForCurrentShow) {
                    finishShow(null, "Rewarded ad closed before verified completion.")
                }
                // If rewarded, completion was already resolved in onRewarded.
                isShowing = false
                activeShowToken = null
            }

            override fun onAdClicked() {
                // no-op
            }

            override fun onAdImpression(impressionData: ImpressionData?) {
                // no-op
            }

            override fun onRewarded(reward: Reward) {
                if (activeShowToken != showToken) return
                if (rewardedForCurrentShow || pendingShowCall == null) return
                rewardedForCurrentShow = true
                val result = JSObject()
                result.put("verified", true)
                result.put("completionToken", UUID.randomUUID().toString())
                val rewardObj = JSObject()
                rewardObj.put("type", reward.type ?: "reward")
                rewardObj.put("amount", reward.amount)
                result.put("reward", rewardObj)
                // Resolve on verified reward callback only. Dismiss after reward should not fail/reward again.
                val pending = pendingShowCall
                pendingShowCall = null
                pending?.resolve(result)
            }
        })

        act.runOnUiThread {
            try {
                rewardedAd = null
                ad.show(act)
            } catch (e: Exception) {
                if (activeShowToken == showToken) {
                    finishShow(null, "Failed to present rewarded ad: ${e.message}")
                }
            }
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", rewardedAd != null && !isLoading && !isShowing && pendingLoadCall == null && pendingShowCall == null)
        call.resolve(result)
    }

    private fun finishShow(result: JSObject?, error: String?) {
        val call = pendingShowCall ?: run {
            isShowing = false
            return
        }
        pendingShowCall = null
        isShowing = false
        activeShowToken = null
        rewardedAd = null
        if (result != null) {
            call.resolve(result)
        } else {
            call.reject(error ?: "Rewarded ad was not completed.")
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        pendingLoadCall?.reject("Plugin destroyed.")
        pendingLoadCall = null
        pendingShowCall?.reject("Plugin destroyed.")
        pendingShowCall = null
        rewardedAd = null
        rewardedAdLoader = null
        isLoading = false
        isShowing = false
        rewardedForCurrentShow = false
        activeShowToken = null
    }
}
