import { useState } from 'react';

interface CreateAccountFormProps {
  onCreate: (ownerName: string) => void | Promise<void>;
}

export function CreateAccountForm({ onCreate }: CreateAccountFormProps) {
  const [ownerName, setOwnerName] = useState('');

  async function submit(): Promise<void> {
    const trimmed = ownerName.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setOwnerName('');
  }

  return (
    <div className="create-form">
      <input
        placeholder="Owner name"
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
      />
      <button onClick={() => void submit()}>Create account</button>
    </div>
  );
}
