import { useMemo, useState, type FormEvent } from 'react';
import { Buildings, ChartLine, Clock, Coins, Rocket, ShieldCheck, Users } from '@phosphor-icons/react';
import { Badge, Button, StatCard, TextField } from '@/ui/components';
import { useGameStore } from '@/game/state/gameStore';
import { selectEmployees, selectPlayerCorporation } from '@/game/state/selectors';
import { commands } from '@/game/commands';
import { formatGameDateShort, toGameDate } from '@/game/clock/gameClock';
import { BASE_CURRENCY_SYMBOL } from '@/simulation/contracts';
import {
  getCorporationStatistics,
  getCorporationTier,
  type CorporationStatus,
} from '@/simulation/corporation';

/**
 * Corporation Overview.
 * Shows the player corporation and its key figures. When no corporation has
 * been established yet, the establishment form is shown instead.
 */
export function CorporationOverview() {
  const corporation = useGameStore(selectPlayerCorporation);
  const employees = useGameStore(selectEmployees);

  const statistics = useMemo(
    () => (corporation ? getCorporationStatistics(corporation, employees) : null),
    [corporation, employees],
  );

  if (!corporation || !statistics) {
    return <EstablishCorporation />;
  }

  const tier = getCorporationTier(corporation.tierId);
  const { finances } = corporation;
  const foundedOn = formatGameDateShort(toGameDate(corporation.foundedAtSimMs));

  return (
    <section className="section-block" aria-label="Corporation overview">
      <h2 className="section-title">
        <Buildings size={18} aria-hidden="true" /> Corporation Overview
      </h2>

      <div className="corp-identity">
        <div className="corp-name-block">
          <span className="corp-name">{corporation.name}</span>
          <span className="corp-tier">
            {tier ? `${tier.name} · Tier ${corporation.level}` : `Tier ${corporation.level}`}
          </span>
        </div>
        <Badge variant={statusVariant(corporation.status)}>{corporation.status}</Badge>
      </div>

      <div className="stat-grid">
        <StatCard
          label="Available Balance"
          value={`${BASE_CURRENCY_SYMBOL}${finances.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
          tone="brand"
        />
        <StatCard
          label="Revenue"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={ChartLine}
          tone="accent"
        />
        <StatCard
          label="Operating Expenses"
          value={`${BASE_CURRENCY_SYMBOL}${finances.lifetimeOperatingExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={Coins}
        />
        <StatCard
          label="Net Profit"
          value={`${BASE_CURRENCY_SYMBOL}${statistics.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={ChartLine}
          tone={statistics.netProfit >= 0 ? 'success' : 'warning'}
        />
        <StatCard
          label="Employees"
          value={`${statistics.employeeCount}${tier ? ` / ${tier.employeeCapacity}` : ''}`}
          hint="Workforce capacity"
          icon={Users}
        />
        <StatCard
          label="Reputation"
          value={Math.round(corporation.reputation)}
          icon={ShieldCheck}
          tone="accent"
        />
        <StatCard
          label="Workforce Productivity"
          value={Math.round(statistics.averageProductivity)}
          hint={`Total ${Math.round(statistics.workforceProductivity)}`}
          icon={Rocket}
        />
        <StatCard
          label="Founded"
          value={foundedOn}
          hint="In-game calendar"
          icon={Clock}
        />
        <StatCard
          label="Missed Payrolls"
          value={corporation.missedPayrollCount}
          hint={corporation.missedPayrollCount > 0 ? 'Workforce on alert' : 'All periods settled'}
          icon={ShieldCheck}
          tone={corporation.missedPayrollCount > 0 ? 'warning' : 'default'}
        />
      </div>
    </section>
  );
}

function statusVariant(status: CorporationStatus): 'ok' | 'pending' | 'brand' | 'danger' | 'warning' {
  switch (status) {
    case 'thriving':
      return 'ok';
    case 'active':
      return 'brand';
    case 'strained':
      return 'warning';
    default:
      return 'danger';
  }
}

/**
 * Establishment form — shown while the player has no corporation.
 */
function EstablishCorporation() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = commands.createCorporation({ name });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setName('');
  };

  return (
    <section className="section-block" aria-label="Establish corporation">
      <h2 className="section-title">
        <Buildings size={18} aria-hidden="true" /> Corporation Overview
      </h2>

      <form className="establish-form" onSubmit={submit}>
        <TextField
          label="Corporation name"
          placeholder="e.g. Helion Dynamics"
          value={name}
          maxLength={48}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          error={error}
          hint="A technology corporation needs a name before it can employ staff."
        />
        <Button type="submit" variant="primary">
          Establish Corporation
        </Button>
      </form>
    </section>
  );
}
