import { useMemo } from 'react';
import { CalendarBlank, Coins, Receipt, Wallet } from '@phosphor-icons/react';
import { StatCard, TransactionRow } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectPlayerCorporation } from '@/game/state/selectors';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import { getPeriodNetProfit } from '@/simulation/corporation';
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
  const periodNet = getPeriodNetProfit(finances);
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
          label="Period Net Profit"
          value={`${BASE_CURRENCY_SYMBOL}${periodNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          tone={periodNet >= 0 ? 'success' : 'warning'}
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
