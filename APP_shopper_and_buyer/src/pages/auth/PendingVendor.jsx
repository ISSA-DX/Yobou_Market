import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import TransactionLayout from '../../components/TransactionLayout.jsx';

export default function PendingVendor() {
  return (
    <TransactionLayout>
      <div className="py-12 text-center">
        <div className="mx-auto w-24 h-24 rounded-full bg-secondary/30 flex items-center justify-center">
          <Icon name="hourglass_top" className="text-secondary text-[44px]" />
        </div>
        <h1 className="mt-6 text-headline-lg font-bold">Awaiting approval</h1>
        <p className="mt-3 text-on-surface-variant max-w-sm mx-auto">
          Your vendor account is currently under review. Our team typically approves new sellers within 1–2 business days.
          You'll be able to log in once approved.
        </p>
        <div className="mt-8 space-y-3 max-w-sm mx-auto">
          <Link to="/logout" className="btn-secondary w-full py-3">Sign out</Link>
          <Link to="/home" className="btn-ghost w-full py-3">Browse as customer</Link>
        </div>
      </div>
    </TransactionLayout>
  );
}