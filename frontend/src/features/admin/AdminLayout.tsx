import {
  ArrowLeft,
  Coins,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
  Layers,
} from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import "./admin.css";
const nav = [
  ["", "Inicio", LayoutDashboard],
  ["professionals", "Profesionales", Users],
  ["plans", "Planes", Layers],
  ["access", "Accesos", KeyRound],
  ["credits", "IA y créditos", Coins],
] as const;
export function AdminLayout() {
  const { signOut } = useAuth();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          <ShieldCheck size={25} />
          <span>
            NUTHRICK<small>ADMINISTRACIÓN</small>
          </span>
        </Link>
        <nav aria-label="Administración">
          {nav.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              end
              to={`/admin${path ? `/${path}` : ""}`}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link to="/app">
            <ArrowLeft size={17} />
            Espacio profesional
          </Link>
          <button onClick={() => void signOut()}>
            <LogOut size={17} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-topline">
          <span>CONTROL DE NUTHRICK</span>
          <span>
            <span className="admin-dot" /> Administración privada
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
