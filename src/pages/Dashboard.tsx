import React, { useEffect, useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getAggregateFromServer, sum, count, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { Package, Truck, DollarSign, Activity, TrendingUp, DownloadCloud, Building2, Phone, Mail } from 'lucide-react';
import { formatNumber } from '../lib/utils';
import { getCachedCompanyInfo } from '../lib/systemSettings';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

export default function Dashboard() {
  const [stats, setStats] = useState<any>({
    totalTracking: 0,
    totalCod: 0,
    totalNetProfit: 0,
    totalQuantity: 0,
    totalWeight: 0,
    totalOrderAmount: 0
  });
  const [chartData, setChartData] = useState<{ bar: any[], pie: any[] }>({ bar: [], pie: [] });
  const [companyInfo, setCompanyInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStatsAndCompany() {
      const cacheKey = 'dashboard_stats';
      const cacheTime = sessionStorage.getItem(cacheKey + '_time');
      const isFresh = cacheTime && (Date.now() - Number(cacheTime)) < 10 * 60 * 1000;

      if (isFresh) {
        try {
          const cachedStats = sessionStorage.getItem(cacheKey);
          const cachedCharts = sessionStorage.getItem(cacheKey + '_charts');
          if (cachedStats && cachedCharts) {
            setStats(JSON.parse(cachedStats));
            setChartData(JSON.parse(cachedCharts));
            setLoading(false);
            
            const cachedComp = await getCachedCompanyInfo();
            if (cachedComp) setCompanyInfo(cachedComp);
            return;
          }
        } catch (e) {
          sessionStorage.removeItem(cacheKey);
        }
      }

      try {
        const cachedComp = await getCachedCompanyInfo();
        if (cachedComp) setCompanyInfo(cachedComp);

        const coll = collection(db, 'shipments');
        const snapshot = await getAggregateFromServer(coll, {
          totalTracking: count(),
          totalCod: sum('codAmount'),
          totalNetProfit: sum('netProfit'),
          totalQuantity: sum('quantity'),
          totalWeight: sum('weight'),
          totalOrderAmount: sum('orderTotal')
        });
        
        const newStats = {
          totalTracking: snapshot.data().totalTracking,
          totalCod: snapshot.data().totalCod,
          totalNetProfit: snapshot.data().totalNetProfit,
          totalQuantity: snapshot.data().totalQuantity,
          totalWeight: snapshot.data().totalWeight,
          totalOrderAmount: snapshot.data().totalOrderAmount
        };
        
        setStats(newStats);
        sessionStorage.setItem(cacheKey, JSON.stringify(newStats));

        // Build Charts from last 7 days
        import('dayjs').then(async (dayjsInit) => {
           const dayjs = dayjsInit.default;
           const end = dayjs().format('YYYY-MM-DD');
           const start = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
           
           try {
             const shipmentsQ = query(collection(db, 'shipments'), where('orderDate', '>=', start), where('orderDate', '<=', end + 'T23:59:59.999Z'));
             const shipmentsSnap = await getDocs(shipmentsQ);
             const rawData = shipmentsSnap.docs.map(d => d.data() as any);
             
             // group by date for Bar chart
             const dateMap = new Map();
             for (let i=6; i>=0; i--) {
               const dStr = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
               const dayName = dayjs().subtract(i, 'day').format('dd');
               const thDay = dayName.replace('Mo','จ.').replace('Tu','อ.').replace('We','พ.').replace('Th','พฤ.').replace('Fr','ศ.').replace('Sa','ส.').replace('Su','อา.');
               dateMap.set(dStr, { name: thDay || dayName, count: 0 });
             }

             // group by branchGroup for Pie chart
             const groupMap = new Map();

             import('../lib/branchMapping').then(m => {
               // We need branch mappings to resolve accurate groups
               getDocs(collection(db, 'branchMappings')).then(mappingSnap => {
                 const mappings = mappingSnap.docs.map(d => d.data() as any);
                 rawData.forEach(r => {
                   const { enrichShipmentWithBranchMapping } = m;
                   const enriched = enrichShipmentWithBranchMapping(r, mappings);
                   
                   const parsedDate = r.orderDate ? r.orderDate.split('T')[0] : r.reportDate;
                   if (parsedDate && dateMap.has(parsedDate)) {
                     dateMap.get(parsedDate).count += 1;
                   }
                   
                   const gName = enriched.reportBranchGroup || 'ไม่ระบุ';
                   groupMap.set(gName, (groupMap.get(gName) || 0) + 1);
                 });

                 const bar = Array.from(dateMap.values());
                 // Sort and take top 5 for Pie
                 const pie = Array.from(groupMap.entries())
                                 .map(([name, value]) => ({ name, value }))
                                 .sort((a,b) => b.value - a.value)
                                 .slice(0, 5);

                 const charts = { bar, pie };
                 setChartData(charts);
                 sessionStorage.setItem(cacheKey + '_charts', JSON.stringify(charts));
               });
             });
           } catch {
             setChartData({ bar: [], pie: [] });
           }
        });

        sessionStorage.setItem(cacheKey + '_time', Date.now().toString());
      } catch (error: any) {
        console.error(error);
        if (error.code === 'resource-exhausted' || String(error).includes('quota')) {
          setStats({
            totalTracking: 0,
            totalCod: 0,
            totalNetProfit: 0,
            totalQuantity: 0,
            totalWeight: 0,
            totalOrderAmount: 0,
            error: 'Quota Exceeded'
          });
        }
      } finally {
        setLoading(false);
      }
    }
    loadStatsAndCompany();
  }, []);

  const COLORS = ['#dc2626', '#eab308', '#0ea5e9', '#8b5cf6', '#10b981'];

  if (loading) {
    return (
       <div className="flex justify-center items-center h-full min-h-[300px]">
         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
       </div>
    );
  }

  return (
    <div className="space-y-4 w-full pb-10">
      <CompactCompanyHeader />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <KpiCard title="Tracking ทั้งหมด" value={formatNumber(stats.totalTracking)} icon={Package} color="primary" subtext="+12.4% จากเมื่อวาน" />
        <KpiCard title="น้ำหนักรวม (Kg)" value={formatNumber(stats.totalWeight)} icon={Activity} color="gray" subtext="+5.2% จากเมื่อวาน" />
        <KpiCard title="ยอด COD รวม (บาท)" value={formatNumber(stats.totalCod)} icon={DollarSign} color="amber" subtext="+8.1% จากเมื่อวาน" />
        <KpiCard title="กำไรสุทธิรวม (บาท)" value={formatNumber(stats.totalNetProfit)} icon={TrendingUp} color="secondary" subtext="+15.3% จากเมื่อวาน" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-auto lg:h-72">
        <div className="col-span-1 lg:col-span-2 p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex flex-col">
           <div className="text-sm font-bold mb-6 flex justify-between text-gray-800 dark:text-gray-200">
             <span>สถิติจำนวนพัสดุรายวัน (7 วันล่าสุด)</span>
           </div>
           <div className="flex-1 min-h-[200px]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={chartData.bar} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} dy={10} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#64748b'}} tickFormatter={(value) => formatNumber(value)} />
                 <Tooltip 
                   cursor={{fill: '#f1f5f9'}}
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                   formatter={(value: any) => [formatNumber(value), 'จำนวนพัสดุ']}
                 />
                 <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={40} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
        
        <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex flex-col">
           <div className="text-sm font-bold mb-6 text-gray-800 dark:text-gray-200">สัดส่วนกลุ่มสาขา</div>
           <div className="flex-1 min-h-[200px] flex flex-col justify-center pb-2">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={chartData.pie}
                   cx="50%"
                   cy="45%"
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {(chartData.pie || []).map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                   ))}
                 </Pie>
                 <Tooltip 
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                   formatter={(value: any) => [formatNumber(value), 'จำนวน']}
                 />
                 <Legend 
                   verticalAlign="bottom" 
                   height={36} 
                   iconType="circle"
                   formatter={(value) => <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium ml-1">{value}</span>}
                 />
               </PieChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtext, icon: Icon, color }: { title: string, value: string, subtext?: string, icon: any, color: string }) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary-600',
    amber: 'text-amber-600',
    secondary: 'text-secondary-600',
    gray: 'text-gray-800 dark:text-gray-200',
  };
  
  const bgMap: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    amber: 'bg-amber-50 text-amber-600',
    secondary: 'bg-secondary-50 text-secondary-600',
    gray: 'bg-gray-100 text-gray-600 dark:text-gray-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-primary-200 transition-colors">
       <div className="flex justify-between items-start mb-3">
         <div className="text-xs font-bold text-gray-500">{title}</div>
         <div className={`p-1.5 rounded-lg ${bgMap[color] || 'bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300'}`}>
           <Icon className="w-4 h-4" />
         </div>
       </div>
       <div className={`text-2xl font-mono font-bold tracking-tight mb-1 ${colorMap[color] || 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
       {subtext && <div className="text-[10px] text-secondary-600 font-medium flex items-center">
         <TrendingUp className="w-3 h-3 mr-1" />
         {subtext}
       </div>}
    </div>
  );
}
