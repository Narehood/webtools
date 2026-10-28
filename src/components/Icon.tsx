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
    case "interest-calculator":
      return (
        <svg {...common}>
          <path d="M4 19h16M6 15V11M11 15V8M16 15V5M5 8l5-3 4 1 5-3" />
        </svg>
      );
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
    case "ipv4":
    case "ipv4-range":
    case "mac-lookup":
    case "mac-generator":
    case "ipv6-ula":
    case "random-port":
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
    case "toml":
    case "xml":
    case "yaml":
    case "sql":
    case "base64-file":
    case "pdf-signature":
    case "meta-tags":
    case "mime":
    case "html-editor":
    case "git-reference":
    case "regex-reference":
    case "http-codes":
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
    case "bcrypt":
    case "ulid":
    case "encryption":
    case "bip39":
    case "rsa":
    case "password-strength":
    case "basic-auth":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      );
    case "color":
    case "svg-placeholder":
    case "camera":
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
    case "billable-hours":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8M8 11h1M12 11h1M16 11h.01M8 15h1M12 15h1M16 15v3M8 18h5" />
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
    case "count":
      return (
        <svg {...common}>
          <path d="M5 7h14M5 12h14M5 17h8" />
        </svg>
      );
    case "bases":
      return (
        <svg {...common}>
          <path d="M7 17V7l5 6 5-6v10" />
        </svg>
      );
    case "encode":
      return (
        <svg {...common}>
          <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
        </svg>
      );
    case "lorem":
      return (
        <svg {...common}>
          <path d="M5 6h14M5 10h10M5 14h14M5 18h7" />
        </svg>
      );
    case "lines":
      return (
        <svg {...common}>
          <path d="M8 6h11M8 12h11M8 18h11M5 6h.01M5 12h.01M5 18h.01" />
        </svg>
      );
    case "percent":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="2" />
          <circle cx="17" cy="17" r="2" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case "aspect":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="10" rx="1" />
          <path d="M8 7V5M16 7V5M8 19v-2M16 19v-2" />
        </svg>
      );
    case "zones":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.2 2.4 2.2 13.6 0 16M12 4c-2.2 2.4-2.2 13.6 0 16" />
        </svg>
      );
    case "color-convert":
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="3" />
          <circle cx="15" cy="10" r="3" />
          <circle cx="11" cy="15" r="3" />
        </svg>
      );
    case "markdown":
      return (
        <svg {...common}>
          <path d="M5 6h14v12H5zM8 15V9l2 2 2-2v6M16 15l2-3-2-3" />
        </svg>
      );
    case "passphrase":
      return (
        <svg {...common}>
          <path d="M6 8h12M6 12h8M6 16h10" />
        </svg>
      );
    case "hmac":
      return (
        <svg {...common}>
          <path d="M8 7l-3 5 3 5M16 7l3 5-3 5M10 16l4-8" />
        </svg>
      );
    case "site-files":
      return (
        <svg {...common}>
          <path d="M7 4h7l4 4v12H7z" />
          <path d="M14 4v4h4M9 13h6M9 16h4" />
        </svg>
      );
    case "qr-reader":
      return <svg {...common}><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M3 12h18" /><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 15h3v3H7zM14 15h3v3h-3z" /></svg>;
    case "pdf-editor":
      return <svg {...common}><path d="M7 3h8l4 4v4M15 3v5h4M7 3v17h7M10 11h4M10 15h2M15 18l5-5 2 2-5 5-3 1z" /></svg>;
    case "pdf":
      return <svg {...common}><path d="M7 3h8l4 4v13H7zM15 3v5h4M4 7v15h11M10 12h6M10 16h4" /></svg>;
    case "domain-health":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h4l2-4 4 8 2-4h6M12 3v2M12 19v2" /></svg>;
    case "docker-compose":
      return <svg {...common}><rect x="3" y="4" width="6" height="6" rx="1" /><rect x="3" y="14" width="6" height="6" rx="1" /><path d="M12 12h9m-3-3 3 3-3 3M6 10v4M15 5h6M15 19h6" /></svg>;
    case "date-calculator":
      return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 15h4M10 13v4M15 15h2" /></svg>;
    case "image-palette":
      return <svg {...common}><path d="M20 13a9 9 0 1 0-8 8c2 0 3-1 2-3s0-3 2-3h2c1 0 2-1 2-2Z" /><circle cx="7" cy="10" r="1" /><circle cx="10" cy="6" r="1" /><circle cx="15" cy="7" r="1" /><circle cx="6" cy="15" r="1" /></svg>;
    case "photo-repair":
      return <svg {...common}><rect x="3" y="6" width="15" height="14" rx="2" /><path d="m3 17 5-5 4 4 3-3 3 3M19 2v6M16 5h6M7 3h6" /></svg>;
    case "photo-color":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /><path d="m3 16 4-4 3 3" /><path d="M15 9h3M15 12h3M15 15h3" /></svg>;
    case "favicon":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m12 6 2 4 4 .5-3 3 .5 4.5-3.5-2-3.5 2 .5-4.5-3-3 4-.5Z" /></svg>;
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
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
