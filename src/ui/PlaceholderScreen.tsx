interface Props {
  title: string;
  body: string;
}

/** A stub for a nav tab that doesn't have a real screen behind it yet. */
export function PlaceholderScreen({ title, body }: Props) {
  return (
    <div className="screen placeholder-screen">
      <h2>{title}</h2>
      <p className="note">{body}</p>
    </div>
  );
}
