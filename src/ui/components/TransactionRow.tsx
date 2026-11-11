export interface TransactionRowProps {
  type: string;
  description: string;
  /** Signed amount: positive is income, negative is an expense. */
  amount: number;
  balanceAfter: number;
  /** Currency symbol. */
  symbol: string;
}

/**
 * AETHRION financial transaction row.
 */
export function TransactionRow({
  type,
  description,
  amount,
  balanceAfter,
  symbol,
}: TransactionRowProps) {
  const isIncome = amount > 0;
  const isFlat = amount === 0;

  return (
    <div className="transaction-row">
      <div className="transaction-main">
        <span className={`transaction-type transaction-type--${type}`}>{type}</span>
        <span className="transaction-description">{description}</span>
      </div>
      <span
        className={`transaction-amount text-mono ${isFlat ? 'is-flat' : isIncome ? 'is-income' : 'is-expense'}`}
      >
        {isFlat ? '—' : `${isIncome ? '+' : '−'}${symbol}${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
      </span>
      <span className="transaction-balance text-mono">
        {symbol}
        {balanceAfter.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
