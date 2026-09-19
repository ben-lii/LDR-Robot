import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
        <h1 className="mb-1 text-xl font-semibold text-text">Teleop</h1>
        <p className="mb-6 text-sm text-text-muted">
          Sign in to drive or view your robot.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
