interface SeedButtonProps {
  onSeed: () => void | Promise<void>;
}

export function SeedButton({ onSeed }: SeedButtonProps) {
  return (
    <button className="seed-button" onClick={() => void onSeed()}>
      Seed $100
    </button>
  );
}
