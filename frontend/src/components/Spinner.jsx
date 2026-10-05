export default function Spinner({ size = 18, label = "Loading" }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
    />
  );
}
