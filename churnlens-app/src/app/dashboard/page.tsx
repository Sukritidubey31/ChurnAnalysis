export default function DashboardPage() {
  return (
    <div className="flex flex-col h-screen bg-[#F9F7F4]">
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-stone-200/80 shadow-sm shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-stone-900 leading-none">Dashboard</h1>
          <p className="text-[11px] text-stone-400 mt-0.5 leading-none">Live customer risk scoring visualization</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-stone-400 font-medium">Live</span>
        </div>
      </header>
      <div className="flex-1 p-4">
        <div className="h-full rounded-2xl overflow-hidden border border-stone-200 shadow-sm bg-white">
          <iframe
            src="https://public.tableau.com/views/ChurnLens/ChurnLens?:embed=yes&:display_count=no&:showVizHome=no"
            width="100%"
            height="100%"
            style={{ border: 'none' }}
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
