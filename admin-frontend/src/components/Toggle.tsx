import { Switch } from '@headlessui/react';

interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ enabled, onChange, disabled = false, size = 'md' }: ToggleProps) {
  const sizeClasses = size === 'sm'
    ? { track: 'h-5 w-9', thumb: 'h-3 w-3', translate: 'translate-x-5' }
    : { track: 'h-6 w-11', thumb: 'h-4 w-4', translate: 'translate-x-6' };

  return (
    <Switch
      checked={enabled}
      onChange={onChange}
      disabled={disabled}
      className={`
        ${enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        relative inline-flex ${sizeClasses.track} items-center rounded-full
        transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2
      `}
    >
      <span className="sr-only">Toggle setting</span>
      <span
        className={`
          ${enabled ? sizeClasses.translate : 'translate-x-1'}
          inline-block ${sizeClasses.thumb} transform rounded-full bg-white shadow-md
          transition-transform duration-200 ease-in-out
        `}
      />
    </Switch>
  );
}

export default Toggle;
