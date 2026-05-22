"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, ReceiptText, FileText, Wallet, Plus } from "lucide-react";

type StaffType = "陪陪人員" | "遊戲技術人員" | "經理級以上";
type Rank = "新手" | "資深" | "核心";
type OrderType = "訂單" | "打賞";

type Staff = {
  id: string;
  name: string;
  staffType: StaffType;
  rank: Rank;
  paymentMethod: string;
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
const MANAGER_START_DATE = "2026-05-01";

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

  const isManagerPeriod =
    staff.staffType === "經理級以上" && order.date >= MANAGER_START_DATE;

  if (isManagerPeriod) {
    const salaryAmount = Math.round(order.amount * 0.95);
    return {
      salaryRate: 95,
      companyRate: 5,
      salaryAmount,
      companyAmount: order.amount - salaryAmount,
      ruleName: "經理制度：公司抽 5%",
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
  if (staff.staffType === "經理級以上") {
    salaryRate = 95;
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
export default function Home() {
  const [activePage, setActivePage] = useState<"dashboard" | "staff" | "orders" | "payslip">("dashboard");
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [notAdmin, setNotAdmin] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("2026-05");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [staffForm, setStaffForm] = useState({
    name: "",
    staffType: "陪陪人員" as StaffType,
    rank: "新手" as Rank,
    paymentMethod: "",
  });

  const [orderForm, setOrderForm] = useState({
    date: "2026-05-21",
    staffId: "",
    customer: "",
    orderType: "訂單" as OrderType,
    item: "",
    amount: "",
    paid: false,
  });
  async function checkAdmin() {
    setCheckingAdmin(true);

    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      window.location.href = "/admin-login";
      return;
    }

    const discordId = getDiscordId(data.user);

    if (!discordId) {
      setNotAdmin(true);
      setCheckingAdmin(false);
      return;
    }

    const { data: adminData, error } = await supabase
      .from("admins")
      .select("*")
      .eq("discord_id", discordId)
      .eq("enabled", true)
      .single();

    if (error || !adminData) {
      setNotAdmin(true);
      setCheckingAdmin(false);
      return;
    }

    setNotAdmin(false);
    setCheckingAdmin(false);
    await loadData();
  }
  async function loadData() {
    setLoading(true);
    const { data: staffData, error: staffError } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });    
    const { data: orderData, error: orderError } = await supabase
      .from("play_orders")
      .select("*")
      .order("date", { ascending: false });
    if (staffError) {
      console.error("讀取員工失敗", staffError);
    }
    if (orderError) {
      console.error("讀取訂單失敗", orderError);
    }
    const formattedStaff: Staff[] = (staffData || []).map((item) => ({
      id: item.discord_id,
      name: item.name || item.discord_id,
      staffType: item.staff_type || "陪陪人員",
      rank: item.rank || "新手",
      paymentMethod: item.payment_method || "未設定",
    }));
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
      setOrderForm((prev) => ({
        ...prev,
        staffId: formattedStaff[0].id,
      }));
    }
    setLoading(false);
  }
  useEffect(() => {
    checkAdmin();
  }, []);
  const staffMap = useMemo(() => {
    return Object.fromEntries(staffList.map((staff) => [staff.id, staff]));
  }, [staffList]);

  const enrichedOrders = useMemo(() => {
    return orders.map((order) => {
      const staff = staffMap[order.staffId];
      const result = calculateSalary(order, staff);
      return {
        ...order,
        staff,
        ...result,
      };
    });
  }, [orders, staffMap]);

  const monthOrders = enrichedOrders.filter((order) => getMonth(order.date) === selectedMonth);

  const dashboard = {
    totalAmount: monthOrders.reduce((sum, order) => sum + order.amount, 0),
    totalSalary: monthOrders.reduce((sum, order) => sum + order.salaryAmount, 0),
    totalCompany: monthOrders.reduce((sum, order) => sum + order.companyAmount, 0),
    unpaidSalary: monthOrders.filter((order) => !order.paid).reduce((sum, order) => sum + order.salaryAmount, 0),
    orderCount: monthOrders.length,
  };

  const selectedStaff = staffMap[selectedStaffId];

  const payslipOrders = monthOrders.filter((order) => order.staffId === selectedStaffId);

  const payslip = {
    totalAmount: payslipOrders.reduce((sum, order) => sum + order.amount, 0),
    salaryAmount: payslipOrders.reduce((sum, order) => sum + order.salaryAmount, 0),
    companyAmount: payslipOrders.reduce((sum, order) => sum + order.companyAmount, 0),
    paidAmount: payslipOrders.filter((order) => order.paid).reduce((sum, order) => sum + order.salaryAmount, 0),
    unpaidAmount: payslipOrders.filter((order) => !order.paid).reduce((sum, order) => sum + order.salaryAmount, 0),
  };

  async function addStaff() {
    if (!staffForm.name.trim()) return;

    const { data, error } = await supabase
      .from("staff")
      .insert({
        name: staffForm.name.trim(),
        staff_type: staffForm.staffType,
        rank: staffForm.rank,
        payment_method: staffForm.paymentMethod.trim() || "未設定",
      })
      .select()
      .single();
    if (error) {
      alert("新增員工失敗");
      console.error(error);
      return;
    }
    const newStaff: Staff = {
      id: data.id,
      name: data.name,
      staffType: data.staff_type,
      rank: data.rank,
      paymentMethod: data.payment_method || "未設定",
    };
    setStaffList([...staffList, newStaff]);
    setStaffForm({
      name: "",
      staffType: "陪陪人員",
      rank: "新手",
      paymentMethod: "",
    });
  }

  async function addOrder() {
    if (!orderForm.customer.trim()) return;
    if (!orderForm.item.trim()) return;
    if (!Number(orderForm.amount)) return;
    const { data, error } = await supabase
      .from("play_orders")
      .insert({
        date: orderForm.date,
        staff_id: orderForm.staffId,
        customer: orderForm.customer.trim(),
        order_type: orderForm.orderType,
        item: orderForm.item.trim(),
        amount: Number(orderForm.amount),
        paid: orderForm.paid,
      })
      .select()
      .single();
    if (error) {
      alert("新增訂單失敗");
      console.error(error);
      return;
    }
    const newOrder: Order = {
      id: data.id,
      date: data.date,
      staffId: data.staff_id,
      customer: data.customer,
      orderType: data.order_type,
      item: data.item,
      amount: data.amount,
      paid: data.paid,
    };
    setOrders([...orders, newOrder]);
    setOrderForm({
      ...orderForm,
      customer: "",
      item: "",
      amount: "",
      paid: false,
    });
  }
  function copyPayslip() {
    const text = `
深夜不關燈 薪資單

陪陪名稱：${selectedStaff?.name || "-"}
人員類型：${selectedStaff?.staffType || "-"}
等級：${selectedStaff?.rank || "-"}
結算月份：${selectedMonth}

總訂單數：${payslipOrders.length} 筆
總金額：${money(payslip.totalAmount)}
薪資實拿：${money(payslip.salaryAmount)}
公司收入：${money(payslip.companyAmount)}

已發放：${money(payslip.paidAmount)}
待發放：${money(payslip.unpaidAmount)}

深夜不關燈 管理系統
      `.trim();

  navigator.clipboard.writeText(text);
    alert("薪資單已複製");
  }
  if (checkingAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-xl font-bold">正在驗證後台權限...</p>
          <p className="mt-2 text-sm text-zinc-400">請稍候</p>
        </div>
      </main>
    );
  }

  if (notAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-rose-300">無法進入後台</p>
          <h1 className="mt-2 text-2xl font-bold">你沒有管理員權限</h1>
          <p className="mt-3 text-sm text-zinc-400">
            只有老闆或管理員可以查看薪資後台。
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/admin-login";
            }}
            className="mt-6 w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
          >
            重新登入
          </button>
        </div>
      </main>
    );
  }
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-xl font-bold">資料讀取中...</p>
          <p className="mt-2 text-sm text-zinc-400">正在連線 Supabase</p>
        </div>
      </main>
    ); 
  }
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 pb-24">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-violet-300">深夜不關燈</p>
            <h1 className="text-3xl font-bold">薪資管理系統</h1>
            <p className="mt-1 text-sm text-zinc-400">
              開幕期、九月後正式制度、訂單與打賞都可自動計算。
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <label className="text-sm text-zinc-400">
              查詢月份
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="ml-3 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-2 rounded-3xl border border-zinc-800 bg-zinc-900 p-2">
          <TabButton active={activePage === "dashboard"} onClick={() => setActivePage("dashboard")} icon={<Wallet size={18} />} text="總覽" />
          <TabButton active={activePage === "staff"} onClick={() => setActivePage("staff")} icon={<Users size={18} />} text="員工" />
          <TabButton active={activePage === "orders"} onClick={() => setActivePage("orders")} icon={<ReceiptText size={18} />} text="訂單" />
          <TabButton active={activePage === "payslip"} onClick={() => setActivePage("payslip")} icon={<FileText size={18} />} text="薪資單" />
        </div>

        {activePage === "dashboard" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-5">
              <Stat title="本月總金額" value={money(dashboard.totalAmount)} />
              <Stat title="應發薪資" value={money(dashboard.totalSalary)} />
              <Stat title="公司收入" value={money(dashboard.totalCompany)} />
              <Stat title="待發放" value={money(dashboard.unpaidSalary)} danger />
              <Stat title="訂單數" value={`${dashboard.orderCount} 筆`} />
            </div>

            <Card title="薪資制度">
              <div className="space-y-3 text-sm text-zinc-300">
                <p>2026/09/01 前：公司抽 10%，人員拿 90%，訂單與打賞都一樣。</p>
                <p>2026/09/01 起：陪陪人員固定 80%。</p>
                <p>遊戲技術人員：新手 80%，資深 85%，核心 90%。</p>
              </div>
            </Card>

            <Card title="最近訂單">
              <OrderTable orders={enrichedOrders.slice().reverse()} />
            </Card>
          </section>
        )}

        {activePage === "staff" && (
          <section className="grid gap-6 md:grid-cols-[360px_1fr]">
            <Card title="新增員工">
              <div className="space-y-4">
                <Input label="名稱" value={staffForm.name} onChange={(value) => setStaffForm({ ...staffForm, name: value })} />

                <Select
                  label="人員類型"
                  value={staffForm.staffType}
                  onChange={(value) => setStaffForm({ ...staffForm, staffType: value as StaffType })}
                  options={["陪陪人員", "遊戲技術人員", "經理級以上"]}
                />

                <Select
                  label="等級"
                  value={staffForm.rank}
                  onChange={(value) => setStaffForm({ ...staffForm, rank: value as Rank })}
                  options={["新手", "資深", "核心"]}
                />

                <Input
                  label="收款方式"
                  value={staffForm.paymentMethod}
                  onChange={(value) => setStaffForm({ ...staffForm, paymentMethod: value })}
                />

                <button onClick={addStaff} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600">
                  <Plus size={18} />
                  新增員工
                </button>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {staffList.map((staff) => (
                <div key={staff.id} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold">{staff.name}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{staff.staffType}</p>
                    </div>
                    <span className="rounded-full bg-violet-500/20 px-3 py-1 text-sm text-violet-200">
                      {staff.rank}
                    </span>
                  </div>
                  <p className="mt-4 rounded-2xl bg-zinc-950 p-3 text-sm text-zinc-300">
                    收款方式：{staff.paymentMethod}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activePage === "orders" && (
          <section className="grid gap-6 md:grid-cols-[360px_1fr]">
            <Card title="新增訂單 / 打賞">
              <div className="space-y-4">
                <Input type="date" label="日期" value={orderForm.date} onChange={(value) => setOrderForm({ ...orderForm, date: value })} />

                <label className="block text-sm text-zinc-400">
                  人員
                  <select
                    value={orderForm.staffId}
                    onChange={(e) => setOrderForm({ ...orderForm, staffId: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                  >
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}｜{staff.staffType}｜{staff.rank}
                      </option>
                    ))}
                  </select>
                </label>

                <Select
                  label="類型"
                  value={orderForm.orderType}
                  onChange={(value) => setOrderForm({ ...orderForm, orderType: value as OrderType })}
                  options={["訂單", "打賞"]}
                />

                <Input label="客人名稱" value={orderForm.customer} onChange={(value) => setOrderForm({ ...orderForm, customer: value })} />
                <Input label="項目" value={orderForm.item} onChange={(value) => setOrderForm({ ...orderForm, item: value })} />
                <Input type="number" label="金額" value={orderForm.amount} onChange={(value) => setOrderForm({ ...orderForm, amount: value })} />

                <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={orderForm.paid}
                    onChange={(e) => setOrderForm({ ...orderForm, paid: e.target.checked })}
                  />
                  已發放薪資
                </label>

                <button onClick={addOrder} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600">
                  <Plus size={18} />
                  新增紀錄
                </button>
              </div>
            </Card>

            <Card title="訂單紀錄">
              <OrderTable orders={enrichedOrders.slice().reverse()} />
            </Card>
          </section>
        )}

        {activePage === "payslip" && (
          <section className="grid gap-6 md:grid-cols-[360px_1fr]">
            <Card title="產生薪資單">
              <div className="space-y-4">
                <label className="block text-sm text-zinc-400">
                  選擇人員
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                  >
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </label>

                <Input type="month" label="月份" value={selectedMonth} onChange={setSelectedMonth} />

                <button onClick={copyPayslip} className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600">
                  複製文字版薪資單
                </button>
              </div>
            </Card>

            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900">
              <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6">
                <p className="text-sm text-violet-100">深夜不關燈</p>
                <h2 className="text-2xl font-bold">薪資單</h2>
              </div>

              <div className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <Info label="名稱" value={selectedStaff?.name || "-"} />
                  <Info label="類型" value={selectedStaff?.staffType || "-"} />
                  <Info label="等級" value={selectedStaff?.rank || "-"} />
                  <Info label="月份" value={selectedMonth} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Stat title="總金額" value={money(payslip.totalAmount)} />
                  <Stat title="薪資實拿" value={money(payslip.salaryAmount)} />
                  <Stat title="公司收入" value={money(payslip.companyAmount)} />
                  <Stat title="已發放" value={money(payslip.paidAmount)} />
                  <Stat title="待發放" value={money(payslip.unpaidAmount)} danger />
                  <Stat title="筆數" value={`${payslipOrders.length} 筆`} />
                </div>

                <OrderTable orders={payslipOrders} />
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function TabButton({
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
      className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium ${
        active ? "bg-violet-500 text-white" : "text-zinc-400 hover:bg-zinc-800"
      }`}
    >
      {icon}
      <span className="hidden md:inline">{text}</span>
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

function Stat({ title, value, danger = false }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${danger ? "text-rose-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-violet-400"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-violet-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
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
      <div className="hidden grid-cols-8 bg-zinc-950 px-4 py-3 text-xs text-zinc-500 md:grid">
        <div>日期</div>
        <div>人員</div>
        <div>類型</div>
        <div>客人</div>
        <div className="col-span-2">項目</div>
        <div>實拿</div>
        <div>狀態</div>
      </div>

      {orders.map((order) => (
        <div
          key={order.id}
          className="grid gap-2 border-t border-zinc-800 px-4 py-4 text-sm md:grid-cols-8 md:items-center"
        >
          <div className="text-zinc-400">{order.date}</div>
          <div className="font-semibold">{order.staff?.name || "-"}</div>
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

          <div className="md:col-span-8 text-xs text-zinc-500">
            {order.ruleName}｜人員 {order.salaryRate}%｜公司 {order.companyRate}%
          </div>
        </div>
      ))}
    </div>
  );
}