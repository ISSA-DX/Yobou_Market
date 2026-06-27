// Reusable icon wrapper — uses Material Symbols Outlined.
export default function Icon({ name, className = '', fill = false }) {
  return (
    <span
      className={`material-symbols-outlined ${fill ? 'icon-fill' : ''} ${className}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}