interface PlaceholderPageProps {
  title: string;
  icon: string;
}

export default function PlaceholderPage({ title, icon }: PlaceholderPageProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-800/20">
      <div className="text-center">
        <p className="text-7xl mb-4">{icon}</p>
        <h2 className="text-white text-2xl font-bold mb-2">{title}</h2>
        <p className="text-slate-500">Esta sección está en construcción</p>
      </div>
    </div>
  );
}
