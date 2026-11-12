import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';

interface SecurityUnlockProps {
  onUnlock: () => void;
  userEmail?: string;
}

/** Full-screen gate shown when local business data is encrypted and the session is locked. */
export const SecurityUnlock: React.FC<SecurityUnlockProps> = ({ onUnlock, userEmail }) => {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      // Dynamically import to keep the crypto out of the initial bundle path
      const secure = await import('../utils/secureStore');
      const ok = await secure.unlock(pass);
      if (ok) {
        onUnlock();
      } else {
        setError('Wrong passphrase — the data stays encrypted. Check Caps Lock and try again.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-8 shadow-xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-sm">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-slate-100">Encrypted Data Lock</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Customer accounts, deliveries &amp; business data are encrypted at rest (AES-256-GCM).
            </p>
          </div>
        </div>

        {userEmail && (
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Signed in as {userEmail}
          </div>
        )}

        <div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            Security Passphrase
          </label>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Enter the enterprise security passphrase"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={busy || !pass}
          onClick={submit}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {busy ? 'Decrypting…' : 'Unlock Data'}
        </button>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          The encryption key is derived from this passphrase (PBKDF2 · 250,000 iterations) and never leaves this
          device. There is no recovery — if the passphrase is lost, the encrypted data cannot be opened.
        </p>
      </div>
    </div>
  );
};
