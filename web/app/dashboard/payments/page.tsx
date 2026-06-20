export default function PaymentsPage() {
  return (
    <div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--db-text-primary)",
          marginBottom: "8px",
        }}
      >
        Payments
      </h1>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
        Stripe Connect balance, payouts, and transaction history — coming in Task 3.6.
      </p>
    </div>
  );
}
