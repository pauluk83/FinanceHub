import { useState } from 'react';
import { Section } from '../../components';
import { APP_CHANGELOG } from '../../appChangelog.generated';
import { APP_VERSION } from '../../version';
import { GITHUB_RELEASES_URL } from '../../installer';
import {
  LATEST_RELEASE_API,
  buildLabel,
  changelogMatchesBuild,
  parseLatestRelease,
  verdictFor,
  type LatestBuild,
} from '../../updateCheck';

type Result =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; latest: LatestBuild; source: string }
  | { phase: 'error'; message: string };

/**
 * A manual check: the newest published release against the build running here,
 * and this build's changelog against its own release note.
 *
 * The desktop app asks its own updater, which reads the update manifest; the
 * hosted build asks the GitHub release list, which a browser is allowed to read.
 */
export function UpdateCheckSection({ notify }: { notify: (message: string) => void }) {
  const [result, setResult] = useState<Result>({ phase: 'idle' });
  const running = { version: APP_VERSION, buildId: APP_CHANGELOG.buildId };
  const changelogCurrent = changelogMatchesBuild(APP_CHANGELOG);
  const newestNote = APP_CHANGELOG.releases[0]?.version ?? 'none';

  const check = async () => {
    setResult({ phase: 'checking' });
    const bridge = window.financeHubDesktop?.updater;
    try {
      let latest: LatestBuild | null = null;
      let source = '';
      if (bridge) {
        const state = await bridge.check(running);
        if (state.phase === 'current') {
          latest = running;
          source = 'the desktop updater';
        } else if (state.phase === 'downloading' || state.phase === 'ready' || state.phase === 'installing') {
          throw new Error('An update is already downloading in the update panel.');
        } else if (state.phase === 'unsupported') {
          throw new Error('This build cannot check for updates itself.');
        } else if (state.version && state.buildId) {
          latest = { version: state.version, buildId: state.buildId };
          source = 'the desktop updater';
        } else {
          throw new Error(state.error ?? 'The updater did not answer.');
        }
      } else {
        const response = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
        if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
        latest = parseLatestRelease(await response.json());
        source = 'the published release';
      }
      if (!latest) throw new Error('The newest release could not be read.');
      setResult({ phase: 'done', latest, source });
      notify(verdictFor(running, latest) === 'current'
        ? `Up to date: ${buildLabel(running)}`
        : `Update available: ${buildLabel(latest)}`);
    } catch (error) {
      setResult({ phase: 'error', message: error instanceof Error ? error.message : 'The check could not be completed.' });
      notify('Update check failed');
    }
  };

  const latest = result.phase === 'done' ? result.latest : null;
  const behind = latest ? verdictFor(running, latest) === 'behind' : false;

  return (
    <Section
      title="Updates"
      sub="Check this build against the newest published release, and its changelog against its own release note"
    >
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div className="toolbar" style={{ borderBottom: 0, padding: 0 }}>
          <button className="btn" onClick={() => void check()} disabled={result.phase === 'checking'}>
            {result.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          <a className="btn ghost" href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">Releases on GitHub</a>
          <div className="toolbar-spacer" />
          <span className="muted small">Running {buildLabel(running)}</span>
        </div>

        {result.phase === 'done' && latest && (
          behind ? (
            <div className="notice warn">
              <strong>An update is available.</strong> The newest published build is {buildLabel(latest)} ({result.source});
              this one is {buildLabel(running)}.{' '}
              {window.financeHubDesktop?.updater
                ? 'The update panel offers it on the next check.'
                : 'Download the installer from the releases page.'}
            </div>
          ) : (
            <div className="notice info">
              <strong>You are on the latest build.</strong> {buildLabel(running)} matches {result.source}.{' '}
              {changelogCurrent
                ? `The changelog's newest entry is ${APP_CHANGELOG.version}, this build's own release.`
                : `The changelog's newest entry is ${newestNote} while this build is ${APP_CHANGELOG.version}, so its release note is out of date.`}
            </div>
          )
        )}

        {result.phase === 'done' && latest && !changelogCurrent && behind && (
          <div className="notice danger">
            This build's own changelog opens with {newestNote} instead of {APP_CHANGELOG.version}, so the release note is out of date.
          </div>
        )}

        {result.phase === 'error' && (
          <div className="notice danger">
            <strong>The check did not finish.</strong> {result.message} Nothing about this build or the budget changed.
          </div>
        )}

        <div className="muted small">
          Every check compares the version and the build id, because two builds of the same day differ only by id.
          The changelog is read from this build, so a release that shipped without its note shows here.
        </div>
      </div>
    </Section>
  );
}
