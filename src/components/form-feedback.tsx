export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="field-error" role="alert">{message}</span>;
}

export function SaveError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="save-error" role="alert">{message}</span>;
}
