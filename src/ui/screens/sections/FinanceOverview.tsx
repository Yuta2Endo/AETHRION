import { useMemo } from 'react';
import { CalendarBlank, ChartLine, Coins, Cube, Factory, Flask, HandCoins, MapPin, Package, Receipt, Storefront, Wallet } from '@phosphor-icons/react';
import { StatCard, TransactionRow } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectPlayerCorporation } from '@/game/state/selectors';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { getNetProfit } from '@/simulation/corporation';
import { getPayrollPeriod } from '@/simulation/employees';

const SIM_DAY_MS = 24 * 3_600_000;

/**
 * Finance Overview.
 * Shows the cash position, the accruing figures of the current period and the
 * most recent transactions.
 */
export function FinanceOverview() {
  const corporation = useGameStore(selectPlayerCorporation);
  const elapsedSimMs = useGameStore((state) => state.simulation.elapsedSimMs);

  const period = useMemo(() => getPayrollPeriod(elapsedSimMs), [elapsedSimMs]);

  if (!corporation) {
    return null;
  }

  const { finances } = corporation;
  const daysUntilPayroll = period.remainingInPeriodMs / SIM_DAY_MS;

  return (
    <section className="section-block" aria-label="Finance overview">
      <h2 className="section-title">
        <Wallet size={18} aria-hidden="true" /> Finance Overview
      </h2>

      <div className="stat-grid">
        <StatCard
          label="Cash Balance"
          value={`${BASE_CURRENCY_SYMBOL}${finances.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          tone="brand"
        />
        <StatCard
          label="Period Revenue"
          value={`${BASE_CURRENCY_SYMBOL}${finances.periodRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          tone="accent"
        />
        <StatCard
          label="Operating Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.periodOperatingExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Receipt}
        />
        <StatCard
          label="Payroll Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimePayrollExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Receipt}
        />
        <StatCard
          label="Research Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeResearchExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Flask}
        />
        <StatCard
          label="Development Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeDevelopmentExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Package}
        />
        <StatCard
          label="Resource Purchases"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeResourceExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Cube}
        />
        <StatCard
          label="Manufacturing Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeProductionExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Factory}
        />
        <StatCard
          label="City Investments"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeCityExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint="Land and construction"
          icon={MapPin}
        />
        <StatCard
          label="Land Disposal"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeCityRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          hint="Resale of city plots"
          icon={HandCoins}
        />
        <StatCard
          label="Sales Revenue"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeSalesRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Storefront}
          tone="success"
        />
        <StatCard
          label="Workforce Revenue"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeWorkforceRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          tone="accent"
        />
        <StatCard
          label="Net Profit"
          value={`${BASE_CURRENCY_SYMBOL}${getNetProfit(finances).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={ChartLine}
          tone={getNetProfit(finances) >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          label="Next Payroll"
          value={`${daysUntilPayroll.toFixed(1)} d`}
          hint={period.id}
          icon={CalendarBlank}
          tone="accent"
        />
      </div>

      <div className="transaction-list">
        <div className="transaction-head" aria-hidden="true">
          <span>Transaction</span>
          <span>Amount</span>
          <span>Balance</span>
        </div>
        {corporation.transactions.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No transactions yet</p>
            <p className="empty-note">
              Revenue, operating costs and payroll are recorded here as the simulation runs.
            </p>
          </div>
        ) : (
          [...corporation.transactions].reverse().map((transaction) => (
            <TransactionRow
              key={transaction.id}
              type={transaction.type}
              description={transaction.description}
              amount={transaction.amount}
              balanceAfter={transaction.balanceAfter}
              symbol={BASE_CURRENCY_SYMBOL}
            />
          ))
        )}
      </div>
    </section>
  );
}
