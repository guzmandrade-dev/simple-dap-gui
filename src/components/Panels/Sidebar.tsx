import { useState } from 'react';
import { CallStackPanel } from './CallStackPanel';
import { VariablesPanel } from './VariablesPanel';
import { BreakpointsPanel } from './BreakpointsPanel';
import { AdapterManagerPanel } from './AdapterManagerPanel';
import { SettingsPanel } from './SettingsPanel';
import { WatchPanel } from './WatchPanel';

type Tab = 'stack' | 'variables' | 'watch' | 'breakpoints' | 'adapters' | 'settings';

interface SidebarProps {
  className?: string;
}

function IconStack({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5l6-3 6 3-6 3-6-3z" />
      <path d="M2 10l6 3 6-3" />
      <path d="M2 7.5l6 3 6-3" />
    </svg>
  );
}

function IconVariables({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M6 3v10" />
      <path d="M9 7h3" />
      <path d="M9 10h3" />
    </svg>
  );
}

function IconWatch({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5v3l2 2" />
    </svg>
  );
}

function IconBreakpoint({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

function IconAdapters({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="12" height="4" rx="1" />
      <path d="M5 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M5 10v2a1 1 0 001 1h4a1 1 0 001-1v-2" />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M12.8 8h1.7M1.5 8h1.7M8 12.8v1.7M8 1.5v1.7M11.3 11.3l1.2 1.2M3.5 3.5l1.2 1.2M11.3 4.7l1.2-1.2M3.5 12.5l1.2-1.2" />
    </svg>
  );
}

const tabs = [
  { id: 'stack' as Tab, label: 'Stack', icon: IconStack, title: 'Call Stack' },
  { id: 'variables' as Tab, label: 'Vars', icon: IconVariables, title: 'Variables' },
  { id: 'watch' as Tab, label: 'Watch', icon: IconWatch, title: 'Watch' },
  { id: 'breakpoints' as Tab, label: 'Breakpoints', icon: IconBreakpoint, title: 'Breakpoints' },
  { id: 'adapters' as Tab, label: 'Adapters', icon: IconAdapters, title: 'Debug Adapters' },
  { id: 'settings' as Tab, label: 'Settings', icon: IconSettings, title: 'Settings' },
];

export function Sidebar({ className }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>('stack');

  return (
    <div className={`flex bg-bg-secondary h-full ${className}`}>
      <div className="w-11 border-r border-border-subtle flex flex-col py-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.title}
              aria-label={tab.title}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-1 text-[10px] leading-tight transition-colors ${
                activeTab === tab.id
                  ? 'text-text bg-bg-tertiary border-l-2 border-accent'
                  : 'text-text-secondary hover:text-text hover:bg-bg-tertiary/50 border-l-2 border-transparent'
              }`}
            >
              <Icon className={activeTab === tab.id ? 'text-accent' : ''} />
              <span className="truncate w-full text-center">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto min-w-0">
        {activeTab === 'stack' && <CallStackPanel />}
        {activeTab === 'variables' && <VariablesPanel />}
        {activeTab === 'watch' && <WatchPanel />}
        {activeTab === 'breakpoints' && <BreakpointsPanel />}
        {activeTab === 'adapters' && <AdapterManagerPanel />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}
