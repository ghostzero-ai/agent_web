import type { AnchorHTMLAttributes, ReactNode } from "react";
import { appHref } from "@/lib/platform/appNavigation";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

export function AppLink({ href, children, ...props }: AppLinkProps) {
  return (
    <a href={appHref(href)} {...props}>
      {children}
    </a>
  );
}
