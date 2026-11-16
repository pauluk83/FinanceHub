import { useState } from 'react';
import { AuthFrame } from './login';
import { AccountSecuritySection } from './accountSecurity';

/**
 * Hosted account settings for the public web build. This page is for account
 * settings, passkeys and cloud-account deletion only. It never loads, saves or
 * syncs a budget document, restore point, vault, portal or feedback record.
 */
export function HostedAccountSettings({
  email,
  onSignOut,
  onTryDemo,
}: {
  email: string | null;
  onSignOut: () => void;
  onTryDemo: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <AuthFrame
      kicker="Hosted account"
      title="Hosted account settings"
      subtitle="Demo and account settings only. Real budgets live in the Windows app."
    >
      <div className="auth-alert auth-notice" role="status">
        <strong>This page does not load a real budget.</strong>
        <span> Use the demo below to look around, or manage passkeys and account deletion here.</span>
      </div>
      {notice && <div className="auth-alert auth-notice" role="status">{notice}</div>}
      <AccountSecuritySection
        isLocal={false}
        notify={(message: string) => setNotice(message)}
        signOut={onSignOut}
        userEmail={email}
      />
      <div className="auth-local">
        <button type="button" className="btn auth-submit" onClick={onTryDemo}>
          Take a look around
        </button>
        <button type="button" className="btn ghost auth-submit" onClick={onSignOut}>
          Sign out
        </button>
        <p>Real-budget editing and sync are available in the Windows app.</p>
      </div>
    </AuthFrame>
  );
}
