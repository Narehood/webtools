export function Icon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "background":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.4" />
          <path d="M4 16l5-4 4 3 7-6" />
        </svg>
      );
    case "convert":
      return (
        <svg {...common}>
          <path d="M7 7h10v10H7z" />
          <path d="M4 11h3M17 13h3M12 4v3M12 17v3" />
        </svg>
      );
    case "compress":
      return (
        <svg {...common}>
          <path d="M8 4h8v4H8zM6 10h12v10H6z" />
          <path d="M10 14h4" />
        </svg>
      );
    case "status":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "whois":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.5 3 2.5 13 0 16M12 4c-2.5 3-2.5 13 0 16" />
        </svg>
      );
    case "dns":
      return (
        <svg {...common}>
          <path d="M5 18h14M7 18V9l5-4 5 4v9" />
        </svg>
      );
    case "qr":
      return (
        <svg {...common}>
          <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM14 14h2v2h-2zM18 18h1" />
        </svg>
      );
    case "json":
      return (
        <svg {...common}>
          <path d="M8 5c-2 0-3 1.5-3 4s1 4 3 4c-2 0-3 1.5-3 4s1 4 3 4M16 5c2 0 3 1.5 3 4s-1 4-3 4c2 0 3 1.5 3 4s-1 4-3 4" />
        </svg>
      );
    case "hash":
      return (
        <svg {...common}>
          <path d="M9 5l-2 14M17 5l-2 14M5 9h14M4 15h14" />
        </svg>
      );
    case "base64":
      return (
        <svg {...common}>
          <path d="M4 8h7v8H4zM13 8h7v8h-7z" />
          <path d="M8 12h2M16.5 10.5v3M15 12h3" />
        </svg>
      );
    case "password":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      );
    case "color":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4v16M4 12h16" />
        </svg>
      );
    case "resize":
      return (
        <svg {...common}>
          <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" />
        </svg>
      );
    case "exif":
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      );
    case "exif-view":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.3" />
          <path d="M8 16l3.5-4 2.5 2.5L18 11" />
        </svg>
      );
    case "ssl":
      return (
        <svg {...common}>
          <rect x="6" y="11" width="12" height="8" rx="2" />
          <path d="M9 11V8a3 3 0 016 0v3" />
        </svg>
      );
    case "headers":
      return (
        <svg {...common}>
          <path d="M5 7h14M5 12h10M5 17h7" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M4 8l8 6 8-6" />
        </svg>
      );
    case "url":
      return (
        <svg {...common}>
          <path d="M9 12a4 4 0 010-6l2-2a4 4 0 016 6l-1 1M15 12a4 4 0 010 6l-2 2a4 4 0 01-6-6l1-1" />
        </svg>
      );
    case "diff":
      return (
        <svg {...common}>
          <path d="M8 5v14M16 5v14M5 9h6M13 15h6" />
        </svg>
      );
    case "data":
      return (
        <svg {...common}>
          <path d="M5 7h14v4H5zM5 13h14v4H5z" />
        </svg>
      );
    case "regex":
      return (
        <svg {...common}>
          <path d="M6 16l4-8 4 8M8 13h4M16 8v8" />
        </svg>
      );
    case "case":
      return (
        <svg {...common}>
          <path d="M6 17V8h5M6 12h4M14 17V8h4" />
        </svg>
      );
    case "ids":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="2" />
          <path d="M8 12h8" />
        </svg>
      );
    case "timestamp":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 1.5" />
        </svg>
      );
    case "cron":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 6v2M12 16v2M6 12h2M16 12h2" />
        </svg>
      );
    case "checksum":
      return (
        <svg {...common}>
          <path d="M7 4h10v6H7zM6 12h12v8H6z" />
          <path d="M9 16h6" />
        </svg>
      );
    case "jwt":
      return (
        <svg {...common}>
          <path d="M5 8h14v8H5z" />
          <path d="M9 12h6" />
        </svg>
      );
    case "port":
      return (
        <svg {...common}>
          <circle cx="7" cy="12" r="3" />
          <path d="M10 12h10M17 8v8" />
        </svg>
      );
    case "egress":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "ptr":
      return (
        <svg {...common}>
          <path d="M19 12H8M12 7l-5 5 5 5" />
        </svg>
      );
    case "cidr":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <path d="M9 9h6v6H9z" />
        </svg>
      );
    case "wifi":
      return (
        <svg {...common}>
          <path d="M5 10c4-4 10-4 14 0M8 13c2.5-2.5 5.5-2.5 8 0" />
          <circle cx="12" cy="17" r="1.2" />
        </svg>
      );
    case "chmod":
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 10h2M12 10h2M16 10h1M8 14h8" />
        </svg>
      );
    case "units":
      return (
        <svg {...common}>
          <path d="M7 5v14M17 5v14M4 8h6M4 16h6M14 8h6M14 16h6" />
        </svg>
      );
    case "totp":
      return (
        <svg {...common}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 9h6M9 13h4" />
        </svg>
      );
    case "pem":
      return (
        <svg {...common}>
          <path d="M8 5h8l3 3v11H8z" />
          <path d="M16 5v3h3M10 12h6M10 15h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
