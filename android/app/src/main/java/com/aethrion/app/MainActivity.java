package com.aethrion.app;

import android.os.Bundle;

import com.aethrion.app.plugins.YandexAdsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YandexAdsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
