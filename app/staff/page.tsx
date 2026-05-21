"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  User,
  ReceiptText,
  Wallet,
  Home,
  CheckCircle2,
  PauseCircle,
  LogOut,
} from "lucide-react";

type StaffType = "陪陪人員" | "遊戲技術人員";
type Rank = "新手" | "資深" | "核心";
type OrderType = "訂單" | "打賞";

type Staff = {
  id: string;
  name: string;
  staffType: StaffType;
  rank: Rank;
  paymentMethod: string;
  game?: string;
  status?: string;
  totalOrders?: number;
  allowedServices?: string;
  onlineStartedAt?: string | null;
};

type Order = {
  id: number;
  date: string;
  staffId: string;
  customer: string;
  orderType: OrderType;
  item: string;
  amount: number;
  paid: boolean;
};

const OPENING_END_DATE = "2026-09-01";

function money(value: number) {
  return `NT$ ${value.toLocaleString("zh-TW")}`;
}

function getMonth(date: string) {
  return date.slice(0, 7);
}

function calculateSalary(order: Order, staff?: Staff) {
  if (!staff) {
    return {
      salaryRate: 0,
      companyRate: 100,
      salaryAmount: 0,
      companyAmount: order.amount,
      ruleName: "未找到員工",
    };
  }

  const isOpeningPeriod = order.date < OPENING_END_DATE;

  if (isOpeningPeriod) {
    const salaryAmount = Math.round(order.amount * 0.9);
    return {
      salaryRate: 90,
      companyRate: 10,
      salaryAmount,
      companyAmount: order.amount - salaryAmount,
      ruleName: "開幕期制度：公司抽 10%",
    };
  }

  let salaryRate = 80;

  if (staff.staffType === "陪陪人員") {
    salaryRate = 80;
  }

  if (staff.staffType === "遊戲技術人員") {
    if (staff.rank === "新手") salaryRate = 80;
    if (staff.rank === "資深") salaryRate = 85;
    if (staff.rank === "核心") salaryRate = 90;
  }

  const salaryAmount = Math.round(order.amount * (salaryRate / 100));

  return {
    salaryRate,
    companyRate: 100 - salaryRate,
    salaryAmount,
    companyAmount: order.amount - salaryAmount,
    ruleName: "九月後正式薪資制度",
  };
}
function getDiscordId(user: any) {
  return (
    user?.user_metadata?.provider_id ||
    user?.user_metadata?.sub ||
    user?.identities?.find((identity: any) => identity.provider === "discord")
      ?.identity_data?.sub ||
    user?.identities?.find((identity: any) => identity.provider === "discord")
      ?.id ||
    ""
  );
}
export default function StaffCenterPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-05");
  const [activePage, setActivePage] = useState<"home" | "orders" | "salary" | "profile">("home");
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [notStaff, setNotStaff] = useState(false);    
  async function loadData(discordId: string) {
    setLoading(true);

    const { data: staffData, error: staffError } = await supabase
      .from("players")
      .select("*")
      .eq("discord_id", discordId)
      .single();

    const { data: orderData, error: orderError } = await supabase
      .from("salary_orders")
      .select("*")
      .order("date", { ascending: false });

    if (staffError) {
      console.error("讀取員工失敗", staffError);
    }

    if (orderError) {
      console.error("讀取薪資紀錄失敗", orderError);
    }

    if (staffError || !staffData) {
      setNotStaff(true);
      setLoading(false);
      return;
    }
    const formattedStaff: Staff[] = [
      {
        id: staffData.discord_id,
        name: staffData.name || staffData.discord_id,
        staffType: "陪陪人員",
        rank: "新手",
        paymentMethod: "未設定",
        game: staffData.game || "",
        status: staffData.status || "offline",
        totalOrders: staffData.total_orders || 0,
        allowedServices: Array.isArray(staffData.allowed_services)
          ? staffData.allowed_services.join("、")
          : staffData.allowed_services || "",
        onlineStartedAt: staffData.online_started_at || null,
      },
    ];

    const formattedOrders: Order[] = (orderData || []).map((item) => ({
      id: item.id,
      date: item.date,
      staffId: item.staff_id,
      customer: item.customer,
      orderType: item.order_type,
      item: item.item,
      amount: item.amount,
      paid: item.paid,
    }));

    setStaffList(formattedStaff);
    setOrders(formattedOrders);

    if (formattedStaff.length > 0) {
      setSelectedStaffId(formattedStaff[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function checkLogin() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      const discordId = getDiscordId(data.user);
      console.log("Discord user:", data.user);
      console.log("Discord ID:", discordId);
      if (!discordId) {
        setNotStaff(true);
        setLoading(false);
        setAuthChecked(true);
        return;
      }
      await loadData(discordId);
      setAuthChecked(true);
    }
    checkLogin();
  }, []);

  const selectedStaff = staffList.find((staff) => staff.id === selectedStaffId);

  const staffOrders = useMemo(() => {
    return orders.filter((order) => order.staffId === selectedStaffId);
  }, [orders, selectedStaffId]);

  const monthOrders = useMemo(() => {
    return staffOrders.filter((order) => getMonth(order.date) === selectedMonth);
  }, [staffOrders, selectedMonth]);

  const enrichedOrders = useMemo(() => {
    return monthOrders.map((order) => {
      const result = calculateSalary(order, selectedStaff);
      return {
        ...order,
        ...result,
      };
    });
  }, [monthOrders, selectedStaff]);

  const salary = {
    totalAmount: enrichedOrders.reduce((sum, order) => sum + order.amount, 0),
    salaryAmount: enrichedOrders.reduce((sum, order) => sum + order.salaryAmount, 0),
    companyAmount: enrichedOrders.reduce((sum, order) => sum + order.companyAmount, 0),
    paidAmount: enrichedOrders
      .filter((order) => order.paid)
      .reduce((sum, order) => sum + order.salaryAmount, 0),
    unpaidAmount: enrichedOrders
      .filter((order) => !order.paid)
      .reduce((sum, order) => sum + order.salaryAmount, 0),
    count: enrichedOrders.length,
  };

  async function updateStatus(nextStatus: string) {
    if (!selectedStaff) return;

    const { error } = await supabase
      .from("players")
      .update({
        status: nextStatus,
        online_started_at: nextStatus === "online" ? new Date().toISOString() : null,
      })
      .eq("discord_id", selectedStaff.id);

    if (error) {
      alert("更新狀態失敗");
      console.error(error);
      return;
    }

    setStaffList((prev) =>
      prev.map((staff) =>
        staff.id === selectedStaff.id
          ? {
              ...staff,
              status: nextStatus,
              onlineStartedAt: nextStatus === "online" ? new Date().toISOString() : null,
            }
          : staff
      )
    );
  }
  function copySalarySlip() {
    const text = `
深夜不關燈 員工薪資單

員工名稱：${selectedStaff?.name || "-"}
結算月份：${selectedMonth}

總筆數：${salary.count} 筆
總金額：${money(salary.totalAmount)}
我的實拿：${money(salary.salaryAmount)}
已發放：${money(salary.paidAmount)}
待發放：${money(salary.unpaidAmount)}

深夜不關燈 員工中心
    `.trim();

    navigator.clipboard.writeText(text);
    alert("薪資單已複製");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-xl font-bold">員工中心讀取中...</p>
          <p className="mt-2 text-sm text-zinc-400">正在連線資料庫</p>
        </div>
      </main>
    );
  }
  if (notStaff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-rose-300">無法進入員工中心</p>
          <h1 className="mt-2 text-2xl font-bold">你目前不是員工</h1>
          <p className="mt-3 text-sm text-zinc-400">
            系統沒有在 players 表找到你的 Discord ID。
          </p>
          <button
            onClick={logout}
            className="mt-6 w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
          >
            重新登入
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-6 pb-28">
        <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-violet-300">深夜不關燈</p>
          <h1 className="mt-1 text-3xl font-bold">員工中心</h1>
          <p className="mt-2 text-sm text-zinc-400">
            查看自己的訂單、薪資、接單狀態與個人資料。
          </p>
          <button
            onClick={logout}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <LogOut size={16} />
              登出
            </button>

          <div className="mt-5 grid gap-3 md:grid-cols-1">
            <label className="block text-sm text-zinc-400">
              查詢月份
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
              />
            </label>
          </div>
        </div>

        {activePage === "home" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat title="本月實拿" value={money(salary.salaryAmount)} />
              <Stat title="待發放" value={money(salary.unpaidAmount)} danger />
              <Stat title="已發放" value={money(salary.paidAmount)} />
              <Stat title="完成筆數" value={`${salary.count} 筆`} />
            </div>

            <div className="grid gap-6 md:grid-cols-[1fr_360px]">
              <Card title="我的狀態">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-sm text-zinc-500">目前狀態</p>
                    <p className="mt-1 text-2xl font-bold">
                      {selectedStaff?.status === "online" ? "可接單" : "未接單"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => updateStatus("online")}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-600"
                    >
                      <CheckCircle2 size={18} />
                      開始接單
                    </button>

                    <button
                      onClick={() => updateStatus("offline")}
                      className="flex items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-3 font-semibold text-white hover:bg-zinc-600"
                    >
                      <PauseCircle size={18} />
                      停止接單
                    </button>
                  </div>
                </div>
              </Card>

              <Card title="員工資料">
                <div className="space-y-3 text-sm text-zinc-300">
                  <Info label="名稱" value={selectedStaff?.name || "-"} />
                  <Info label="Discord ID" value={selectedStaff?.id || "-"} />
                  <Info label="遊戲" value={selectedStaff?.game || "-"} />
                  <Info label="累積接單" value={`${selectedStaff?.totalOrders || 0} 筆`} />
                </div>
              </Card>
            </div>

            <Card title="最近訂單">
              <OrderTable orders={enrichedOrders.slice(0, 5)} />
            </Card>
          </section>
        )}

        {activePage === "orders" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat title="本月總金額" value={money(salary.totalAmount)} />
              <Stat title="我的實拿" value={money(salary.salaryAmount)} />
              <Stat title="待發放" value={money(salary.unpaidAmount)} danger />
              <Stat title="筆數" value={`${salary.count} 筆`} />
            </div>

            <Card title="我的訂單紀錄">
              <OrderTable orders={enrichedOrders} />
            </Card>
          </section>
        )}

        {activePage === "salary" && (
          <section className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
              <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6">
                <p className="text-sm text-violet-100">深夜不關燈</p>
                <h2 className="text-2xl font-bold">我的薪資</h2>
              </div>

              <div className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <Info label="名稱" value={selectedStaff?.name || "-"} />
                  <Info label="月份" value={selectedMonth} />
                  <Info label="身份" value={selectedStaff?.staffType || "-"} />
                  <Info label="等級" value={selectedStaff?.rank || "-"} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Stat title="總金額" value={money(salary.totalAmount)} />
                  <Stat title="我的實拿" value={money(salary.salaryAmount)} />
                  <Stat title="公司收入" value={money(salary.companyAmount)} />
                  <Stat title="已發放" value={money(salary.paidAmount)} />
                  <Stat title="待發放" value={money(salary.unpaidAmount)} danger />
                  <Stat title="筆數" value={`${salary.count} 筆`} />
                </div>

                <button
                  onClick={copySalarySlip}
                  className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
                >
                  複製文字版薪資單
                </button>
              </div>
            </div>

            <Card title="薪資明細">
              <OrderTable orders={enrichedOrders} />
            </Card>
          </section>
        )}

        {activePage === "profile" && (
          <section className="space-y-6">
            <Card title="我的資料">
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="名稱" value={selectedStaff?.name || "-"} />
                <Info label="Discord ID" value={selectedStaff?.id || "-"} />
                <Info label="遊戲" value={selectedStaff?.game || "-"} />
                <Info label="狀態" value={selectedStaff?.status || "-"} />
                <Info label="累積接單" value={`${selectedStaff?.totalOrders || 0} 筆`} />
                <Info label="可服務項目" value={selectedStaff?.allowedServices || "-"} />
              </div>
            </Card>

            <Card title="說明">
              <div className="space-y-2 text-sm text-zinc-300">
                <p>目前員工中心為測試版，先用下拉選單切換員工。</p>
                <p>之後會改成 Discord 登入，員工只能看到自己的資料。</p>
              </div>
            </Card>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 p-2 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-4 gap-2">
          <BottomButton
            active={activePage === "home"}
            onClick={() => setActivePage("home")}
            icon={<Home size={18} />}
            text="首頁"
          />
          <BottomButton
            active={activePage === "orders"}
            onClick={() => setActivePage("orders")}
            icon={<ReceiptText size={18} />}
            text="訂單"
          />
          <BottomButton
            active={activePage === "salary"}
            onClick={() => setActivePage("salary")}
            icon={<Wallet size={18} />}
            text="薪資"
          />
          <BottomButton
            active={activePage === "profile"}
            onClick={() => setActivePage("profile")}
            icon={<User size={18} />}
            text="我的"
          />
        </div>
      </div>
    </main>
  );
}

function BottomButton({
  active,
  onClick,
  icon,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-2 py-3 text-xs font-medium ${
        active ? "bg-violet-500 text-white" : "text-zinc-500"
      }`}
    >
      <div className="mb-1 flex justify-center">{icon}</div>
      {text}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Stat({
  title,
  value,
  danger = false,
}: {
  title: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${danger ? "text-rose-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}

function OrderTable({ orders }: { orders: any[] }) {
  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
        目前沒有資料
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="hidden grid-cols-7 bg-zinc-950 px-4 py-3 text-xs text-zinc-500 md:grid">
        <div>日期</div>
        <div>類型</div>
        <div>客人</div>
        <div className="col-span-2">項目</div>
        <div>實拿</div>
        <div>狀態</div>
      </div>

      {orders.map((order) => (
        <div
          key={order.id}
          className="grid gap-2 border-t border-zinc-800 px-4 py-4 text-sm md:grid-cols-7 md:items-center"
        >
          <div className="text-zinc-400">{order.date}</div>
          <div>
            <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs text-violet-200">
              {order.orderType}
            </span>
          </div>
          <div className="text-zinc-300">{order.customer}</div>
          <div className="col-span-2 text-zinc-400">{order.item}</div>
          <div className="font-bold text-violet-200">{money(order.salaryAmount)}</div>
          <div>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                order.paid ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {order.paid ? "已發放" : "待發放"}
            </span>
          </div>

          <div className="text-xs text-zinc-500 md:col-span-7">
            {order.ruleName}｜人員 {order.salaryRate}%｜公司 {order.companyRate}%
          </div>
        </div>
      ))}
    </div>
  );
}