// Inert message banner. `text` is always rendered as a text node (React escapes
// it), never as HTML — server-provided error strings are safe here.

interface BannerProps {
  kind: 'error' | 'info' | 'success';
  text: string;
}

export function Banner({ kind, text }: BannerProps) {
  if (!text) return null;
  return (
    <div className={`banner banner-${kind}`} role="alert">
      {text}
    </div>
  );
}
