'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'דשבורד' },
  { href: '/calendar', label: 'יומן' },
  { href: '/customers', label: 'לקוחות' },
  { href: '/pricing', label: 'מחירון' },
];

export default function MainNavigation() {
  const pathname = usePathname();
  return <nav className="nav" aria-label="ניווט ראשי">
    {links.map(link => {
      const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
      return <Link key={link.href} href={link.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>{link.label}</Link>;
    })}
  </nav>;
}
