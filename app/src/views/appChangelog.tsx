import { type ReactNode } from 'react';
import { Badge, Section } from '../components';
import { APP_CHANGELOG, type AppChangelogRelease } from '../appChangelog.generated';
import { HOSTED_WEB } from '../runtime';
import { APP_VERSION } from '../version';
import {
  GITHUB_REPO_URL,
  installerChecksumsUrl,
  installerDownloadUrl,
} from '../installer';

/**
 * The installer is a GitHub Release asset, so the link can be built from the
 * current version. No API call is needed: GitHub's unauthenticated API is rate
 * limited, which used to make an existing release look missing.
 */
function InstallerDownload() {
  if (!HOSTED_WEB) return null;

  return (
    <div className="notice info" style={{ display: 'grid', gap: 8 }}>
      <div>
        <strong>Windows installer</strong> v{APP_VERSION}
      </div>
      <div className="muted small">
        Every release attaches its dated Windows installer and a SHA-256 checksum file.
        Downloads are served by GitHub Releases rather than this website.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <a className="btn primary" href={installerDownloadUrl(APP_VERSION)}>Download for Windows</a>
        <a className="btn ghost" href={installerChecksumsUrl(APP_VERSION)} target="_blank" rel="noreferrer">SHA-256 checksums</a>
      </div>
      <div className="muted small">
        This build is v{APP_VERSION}. The installer is unsigned; Windows may show an unknown-publisher warning.
      </div>
    </div>
  );
}

/** Render the **bold** and `code` markers used in CHANGELOG.md as real elements. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
}

function Release({ release }: { release: AppChangelogRelease; key?: string }) {
  return (
    <div className="list-row" style={{ display: 'block' }}>
      <div className="title">
        Version {release.version} <span className="muted small">· {release.date}</span>
        {release.version === APP_CHANGELOG.version && <Badge tone="green">This build</Badge>}
      </div>
      {release.sections.map((section) => (
        <div key={section.title} style={{ marginTop: 8 }}>
          <div className="sub" style={{ fontWeight: 600, color: 'var(--text)' }}>{section.title}</div>
          <ul className="muted small" style={{ margin: '4px 0 0 18px', padding: 0, display: 'grid', gap: 3 }}>
            {section.items.map((item) => <li key={item}>{inline(item)}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ReleaseList() {
  return (
    <div className="list">
      {APP_CHANGELOG.releases.map((release) => <Release key={release.version} release={release} />)}
    </div>
  );
}

function buildMeta() {
  return `Version ${APP_CHANGELOG.version} · build ${APP_CHANGELOG.buildId} · ${APP_CHANGELOG.builtAt.slice(0, 10)}`;
}

/** In-app view: Tools → Application changelog. */
export function AppChangelogView() {
  return (
    <Section
      title="Application changelog"
      sub={`${buildMeta()} — regenerated on every build, so it always matches the running code`}
    >
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <InstallerDownload />
        <div className="notice info">
          <strong>Append-only history.</strong> A new build adds its notes at the top; every earlier release below stays exactly as it was.
          Budget figures and their changes are kept separately in the Budget changelog.
        </div>
        <ReleaseList />
      </div>
    </Section>
  );
}

/** Standalone page for the login screen and the #app-changelog route. */
export function AppChangelogPage({ onClose }: { onClose: () => void }) {
  return (
    <div className="legal-shell">
      <header className="legal-head">
        <div className="brand">
          <div className="brand-mark">FH</div>
          <div className="brand-text">
            <div className="brand-title">FinanceHub™</div>
            <div className="brand-sub">Application changelog</div>
          </div>
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="btn" onClick={onClose}>Back to FinanceHub</button>
      </header>
      <main className="legal-body">
        <div className="legal-meta">{buildMeta()} · What changed in each release</div>
        <InstallerDownload />
        <div className="notice info">
          <strong>Append-only history.</strong> Earlier releases are never rewritten; the newest build is at the top.
        </div>
        <ReleaseList />
        <footer className="legal-foot">
          <span>Budget changes stay in the separate Budget changelog inside the app.</span>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">Source on GitHub ↗</a>
        </footer>
      </main>
    </div>
  );
}
