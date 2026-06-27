import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

const BENTO = [
  { name: 'Electronics', icon: 'devices', color: 'from-primary to-primary-container', size: 'col-span-2 row-span-2', textColor: 'text-white' },
  { name: 'Fashion', icon: 'checkroom', color: 'bg-pink-50', textColor: 'text-pink-600' },
  { name: 'Home', icon: 'chair', color: 'bg-amber-50', textColor: 'text-amber-700' },
  { name: 'Beauty', icon: 'spa', color: 'bg-rose-50', textColor: 'text-rose-500' },
];

const ALL_CATS = [
  { name: 'Phones', icon: 'smartphone', color: 'bg-indigo-50 text-indigo-600' },
  { name: 'Computers', icon: 'computer', color: 'bg-slate-100 text-slate-700' },
  { name: 'Shoes', icon: 'steps', color: 'bg-orange-50 text-orange-600' },
  { name: 'Kitchen', icon: 'blender', color: 'bg-teal-50 text-teal-600' },
  { name: 'Sports', icon: 'sports_basketball', color: 'bg-green-50 text-green-600' },
  { name: 'Fitness', icon: 'fitness_center', color: 'bg-lime-50 text-lime-700' },
  { name: 'Toys', icon: 'toys', color: 'bg-yellow-50 text-yellow-600' },
  { name: 'Gaming', icon: 'sports_esports', color: 'bg-violet-50 text-violet-600' },
  { name: 'TV & Audio', icon: 'tv', color: 'bg-cyan-50 text-cyan-700' },
  { name: 'Appliances', icon: 'kitchen', color: 'bg-stone-100 text-stone-700' },
  { name: 'Automotive', icon: 'directions_car', color: 'bg-red-50 text-red-600' },
  { name: 'Books', icon: 'menu_book', color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Grocery', icon: 'local_grocery_store', color: 'bg-lime-50 text-lime-800' },
  { name: 'Health', icon: 'medical_services', color: 'bg-sky-50 text-sky-600' },
  { name: 'Pet Supplies', icon: 'pets', color: 'bg-amber-50 text-amber-600' },
  { name: 'Baby', icon: 'child_care', color: 'bg-fuchsia-50 text-fuchsia-600' },
  { name: 'Jewelry', icon: 'diamond', color: 'bg-purple-50 text-purple-600' },
  { name: 'Watches', icon: 'watch', color: 'bg-zinc-100 text-zinc-700' },
  { name: 'Bags', icon: 'shopping_bag', color: 'bg-orange-50 text-orange-700' },
  { name: 'Office', icon: 'print', color: 'bg-neutral-100 text-neutral-700' },
  { name: 'Garden', icon: 'yard', color: 'bg-green-50 text-green-700' },
  { name: 'Tools', icon: 'construction', color: 'bg-gray-100 text-gray-700' },
  { name: 'Arts & Crafts', icon: 'brush', color: 'bg-fuchsia-50 text-fuchsia-700' },
  { name: 'Musical', icon: 'music_note', color: 'bg-red-50 text-red-500' },
];

export default function Categories() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { categories } = await api('/api/products/categories');
      setGroups(categories || []);
    } catch {
      setError('Could not load categories.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const q = query.trim().toLowerCase();
  const filteredBento = useMemo(() => BENTO.filter((c) => c.name.toLowerCase().includes(q)), [q]);
  const filteredAll = useMemo(() => ALL_CATS.filter((c) => c.name.toLowerCase().includes(q)), [q]);

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      <header className="flex items-center justify-between">
        <Link to="/home" className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center font-black">Y</div>
          <span className="font-bold">Yobou</span>
        </Link>
        <Link to="/cart" className="p-2"><Icon name="shopping_bag" className="text-[24px]" /></Link>
      </header>

      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
        <input
          className="input pl-10 w-full"
          placeholder="Search categories"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div>
        <h1 className="text-headline-lg font-bold mb-3">Browse by category</h1>

        {error && (
          <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between mb-3">
            <span>{error}</span>
            <button onClick={load} className="text-primary font-semibold">Retry</button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 text-on-surface-variant">
            <Icon name="progress_activity" className="text-[32px] animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-3 grid-rows-2 gap-3 h-72">
            {filteredBento.map((c, i) => (
              <Link
                key={c.name}
                to={`/categories/${encodeURIComponent(c.name)}`}
                className={`rounded-xl relative overflow-hidden ${c.size} ${c.color.includes('from-') ? `bg-gradient-to-br ${c.color}` : c.color}`}
              >
                <div className={`p-4 ${c.textColor}`}>
                  <div className="font-bold">{c.name}</div>
                  <div className="text-label-md opacity-70">
                    {groups.find((g) => g.name === c.name)?.count || 0} items
                  </div>
                </div>
                <Icon name={c.icon} className={`absolute bottom-2 right-2 text-[44px] ${c.textColor} opacity-30`} />
                {i === 0 && <Icon name={c.icon} className={`absolute bottom-4 right-4 text-[120px] ${c.textColor} opacity-15`} />}
              </Link>
            ))}
          </div>
        )}

        {!loading && filteredBento.length === 0 && q && (
          <p className="text-sm text-on-surface-variant py-4">No featured categories match “{query}”. Showing all matches below.</p>
        )}

        <div className="mt-4">
          <h3 className="text-title-lg font-semibold mb-3">All categories</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {filteredAll.map((c) => (
              <Link
                key={c.name}
                to={`/categories/${encodeURIComponent(c.name)}`}
                className="flex flex-col items-center gap-2 group"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-active:scale-95 ${c.color}`}>
                  <Icon name={c.icon} className="text-[24px]" />
                </div>
                <span className="text-label-sm text-center leading-tight line-clamp-2">{c.name}</span>
              </Link>
            ))}
          </div>
          {filteredAll.length === 0 && q && (
            <p className="text-sm text-on-surface-variant py-4 text-center">No categories match “{query}”.</p>
          )}
        </div>
      </div>

      <div className="card p-5 bg-gradient-to-br from-secondary to-yellow-400 text-on-secondary relative overflow-hidden">
        <div className="relative z-10 max-w-[70%]">
          <div className="chip bg-white/30 text-on-secondary border-0 mb-2">New Arrivals</div>
          <h3 className="text-headline-md font-bold">Summer Collection 2026</h3>
          <p className="text-label-md mt-1">Up to 40% off on selected items.</p>
          <Link to="/home" className="mt-3 inline-block bg-white text-on-secondary font-semibold px-4 py-2 rounded-full text-sm">Explore →</Link>
        </div>
        <Icon name="checkroom" className="absolute -right-2 -bottom-2 text-[100px] opacity-20" />
      </div>
    </div>
  );
}
