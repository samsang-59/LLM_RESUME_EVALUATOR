import { Link } from 'react-router-dom';

export default function BackButton({ to, children }) {
  return (
    <Link to={to} className="btn btn-back">
      ← {children}
    </Link>
  );
}
