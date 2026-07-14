import { useState, useRef, useEffect } from "react";

const PORTS = [
  // China
  { name: "Shanghai", country: "China" },
  { name: "Ningbo", country: "China" },
  { name: "Shenzhen", country: "China" },
  { name: "Guangzhou", country: "China" },
  { name: "Qingdao", country: "China" },
  { name: "Tianjin", country: "China" },
  { name: "Xiamen", country: "China" },
  { name: "Dalian", country: "China" },
  // Korea / Japan / Taiwan / HK
  { name: "Busan", country: "South Korea" },
  { name: "Incheon", country: "South Korea" },
  { name: "Tokyo", country: "Japan" },
  { name: "Yokohama", country: "Japan" },
  { name: "Osaka", country: "Japan" },
  { name: "Kobe", country: "Japan" },
  { name: "Nagoya", country: "Japan" },
  { name: "Kaohsiung", country: "Taiwan" },
  { name: "Taichung", country: "Taiwan" },
  { name: "Hong Kong", country: "Hong Kong" },
  // SE Asia
  { name: "Singapore", country: "Singapore" },
  { name: "Port Klang", country: "Malaysia" },
  { name: "Tanjung Pelepas", country: "Malaysia" },
  { name: "Penang", country: "Malaysia" },
  { name: "Laem Chabang", country: "Thailand" },
  { name: "Bangkok", country: "Thailand" },
  { name: "Ho Chi Minh City", country: "Vietnam" },
  { name: "Hai Phong", country: "Vietnam" },
  { name: "Da Nang", country: "Vietnam" },
  { name: "Jakarta (Tanjung Priok)", country: "Indonesia" },
  { name: "Surabaya", country: "Indonesia" },
  { name: "Manila", country: "Philippines" },
  // South Asia
  { name: "Nhava Sheva (Mumbai)", country: "India" },
  { name: "Chennai", country: "India" },
  { name: "Kolkata", country: "India" },
  { name: "Mundra", country: "India" },
  { name: "Visakhapatnam", country: "India" },
  { name: "Colombo", country: "Sri Lanka" },
  { name: "Karachi", country: "Pakistan" },
  { name: "Chittagong", country: "Bangladesh" },
  // Middle East
  { name: "Jebel Ali", country: "UAE" },
  { name: "Dubai", country: "UAE" },
  { name: "Abu Dhabi (Khalifa)", country: "UAE" },
  { name: "Salalah", country: "Oman" },
  { name: "Muscat", country: "Oman" },
  { name: "Dammam (King Abdul Aziz)", country: "Saudi Arabia" },
  { name: "Jeddah", country: "Saudi Arabia" },
  { name: "King Abdullah Port", country: "Saudi Arabia" },
  { name: "Kuwait (Shuaiba)", country: "Kuwait" },
  { name: "Aqaba", country: "Jordan" },
  { name: "Haifa", country: "Israel" },
  { name: "Ashdod", country: "Israel" },
  { name: "Bandar Abbas", country: "Iran" },
  // North Africa
  { name: "Port Said", country: "Egypt" },
  { name: "Alexandria", country: "Egypt" },
  { name: "Damietta", country: "Egypt" },
  { name: "Tanger Med", country: "Morocco" },
  { name: "Djibouti", country: "Djibouti" },
  // Europe
  { name: "Rotterdam", country: "Netherlands" },
  { name: "Antwerp", country: "Belgium" },
  { name: "Hamburg", country: "Germany" },
  { name: "Bremerhaven", country: "Germany" },
  { name: "Felixstowe", country: "UK" },
  { name: "Southampton", country: "UK" },
  { name: "Liverpool", country: "UK" },
  { name: "Barcelona", country: "Spain" },
  { name: "Valencia", country: "Spain" },
  { name: "Algeciras", country: "Spain" },
  { name: "Le Havre", country: "France" },
  { name: "Marseille", country: "France" },
  { name: "Piraeus", country: "Greece" },
  { name: "Genoa", country: "Italy" },
  { name: "La Spezia", country: "Italy" },
  { name: "Gioia Tauro", country: "Italy" },
  { name: "Lisbon", country: "Portugal" },
  { name: "Sines", country: "Portugal" },
  { name: "Gdansk", country: "Poland" },
  { name: "Gothenburg", country: "Sweden" },
  { name: "Helsinki", country: "Finland" },
  { name: "Istanbul (Ambarli)", country: "Turkey" },
  { name: "Mersin", country: "Turkey" },
  // Americas
  { name: "Los Angeles", country: "USA" },
  { name: "Long Beach", country: "USA" },
  { name: "New York / New Jersey", country: "USA" },
  { name: "Savannah", country: "USA" },
  { name: "Charleston", country: "USA" },
  { name: "Houston", country: "USA" },
  { name: "Baltimore", country: "USA" },
  { name: "Norfolk", country: "USA" },
  { name: "Seattle / Tacoma", country: "USA" },
  { name: "Miami", country: "USA" },
  { name: "Santos", country: "Brazil" },
  { name: "Rio de Janeiro", country: "Brazil" },
  { name: "Buenos Aires", country: "Argentina" },
  { name: "Callao (Lima)", country: "Peru" },
  { name: "Manzanillo", country: "Mexico" },
  { name: "Veracruz", country: "Mexico" },
  { name: "Vancouver", country: "Canada" },
  { name: "Montreal", country: "Canada" },
  { name: "Cartagena", country: "Colombia" },
  { name: "Manzanillo (Colon)", country: "Panama" },
  { name: "Balboa (Panama City)", country: "Panama" },
  { name: "Kingston", country: "Jamaica" },
  // Africa
  { name: "Durban", country: "South Africa" },
  { name: "Cape Town", country: "South Africa" },
  { name: "Mombasa", country: "Kenya" },
  { name: "Dar es Salaam", country: "Tanzania" },
  { name: "Lagos (Apapa)", country: "Nigeria" },
  { name: "Tema", country: "Ghana" },
  { name: "Abidjan", country: "Ivory Coast" },
  // Oceania
  { name: "Sydney (Port Botany)", country: "Australia" },
  { name: "Melbourne", country: "Australia" },
  { name: "Brisbane", country: "Australia" },
  { name: "Fremantle (Perth)", country: "Australia" },
  { name: "Adelaide", country: "Australia" },
  { name: "Auckland", country: "New Zealand" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function PortInput({ value, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const q = value.toLowerCase();
  const filtered =
    q.length >= 2
      ? PORTS.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.country.toLowerCase().includes(q)
        ).slice(0, 8)
      : [];

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={`${p.name}-${p.country}`}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center justify-between gap-3 border-b border-slate-100 last:border-0"
              onMouseDown={() => {
                onChange(`${p.name}, ${p.country}`);
                setOpen(false);
              }}
            >
              <span className="text-slate-800 font-medium">{p.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{p.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
