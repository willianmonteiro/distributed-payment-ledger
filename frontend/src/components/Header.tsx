export function Header() {
  return (
    <header>
      <h1>Distributed Payment Ledger — Live Demo</h1>
      <p className="subtitle">
        Bank A (NestJS, :3000) and Bank B (FastAPI, :8001) are two independent services settling
        transfers through RabbitMQ. Create an account on each side, fund the payer, then send a
        transfer and watch the saga settle.
      </p>
    </header>
  );
}
