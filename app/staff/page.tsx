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

type StaffType = "陪陪人員" | "遊戲技術人員" | "經理級以上";
type Rank = "新手" | "資深" | "核心";
type OrderType = "訂單" | "打賞";

type Staff = {
  id: string;
  name: string;
  staffType: StaffType;
  rank: Rank;
  paymentMethod: string;
  bankName?: string;
  bankCode?: string;
  bankAccount?: string;
  bankHolder?: string;
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
type ExtraPayment = {
  id: number;
  staffId: string;
  month: string;
  roleType: string;
  baseAmount: number;
  unitAmount: number;
  count: number;
  totalAmount: number;
  note: string;
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
export default function StaffCenterPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [activePage, setActivePage] = useState<"home" | "orders" | "salary" | "profile">("home");
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [notStaff, setNotStaff] = useState(false);    
  const [bankForm, setBankForm] = useState({
    bankName: "",
    bankCode: "",
    bankAccount: "",
    bankHolder: "",
  });
  async function loadData(discordId: string) {
    setLoading(true);

    const { data: staffData, error: staffError } = await supabase
      .from("players")
      .select("*")
      .eq("discord_id", discordId)
      .single();

    const { data: orderData, error: orderError } = await supabase
      .from("play_orders")
      .select("*")
      .eq("assigned_player", discordId)
      .order("created_at", { ascending: false });
    const { data: extraData, error: extraError } = await supabase
      .from("staff_extra_payments")
      .select("*")
      .eq("staff_id", discordId)
      .order("created_at", { ascending: false });
    if (staffError) {
      console.error("讀取員工失敗", staffError);
    }
    if (orderError) {
      console.error("讀取薪資紀錄失敗", orderError);
    }
    if (extraError) {
      console.error("讀取額外職位薪資失敗", extraError);
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
        staffType: staffData.staff_type || "陪陪人員",
        rank: (staffData.rank || "新手") as Rank,
        paymentMethod: staffData.payment_method || "未設定",
        bankName: staffData.bank_name || "",
        bankCode: staffData.bank_code || "",
        bankAccount: staffData.bank_account || "",
        bankHolder: staffData.bank_holder || "",
        game: staffData.game || "",
        status: staffData.status || "offline",
        totalOrders: staffData.total_orders || 0,
        allowedServices: Array.isArray(staffData.allowed_services)
          ? staffData.allowed_services.join("、")
          : staffData.allowed_services || "",
        onlineStartedAt: staffData.online_started_at || null,
      },
    ];

    const formattedOrders: Order[] = (orderData || []).map((item) => {
      const service = item.service || item.item || "未填寫";
      return {
        id: item.id,
        date:
          item.completed_at?.slice(0, 10) ||
          item.created_at?.slice(0, 10) ||
          item.date ||
          "",
        staffId:
          item.assigned_player ||
          item.staff_id ||
          "",
        customer:
          item.customer_username ||
          item.customer_name ||
          item.customer ||
          item.customer_id ||
          "未知客人",
        orderType:
          service.startsWith("打賞：")
            ? "打賞"
            : item.order_type || "訂單",
        item: service,
        amount:
          Number(item.final_price ?? item.price ?? item.amount ?? 0),
        paid: Boolean(item.salary_paid),
      };
    });
    const formattedExtraPayments: ExtraPayment[] = (extraData || []).map((item) => ({
      id: item.id,
      staffId: item.staff_id,
      month: item.month,
      roleType: item.role_type,
      baseAmount: Number(item.base_amount || 0),
      unitAmount: Number(item.unit_amount || 0),
      count: Number(item.count || 0),
      totalAmount: Number(
        item.total_amount ??
          ((item.base_amount || 0) + (item.unit_amount || 0) * (item.count || 0))
      ),
      note: item.note || "",
      paid: Boolean(item.salary_paid),
    }));
    setStaffList(formattedStaff);
    setOrders(formattedOrders);
    setExtraPayments(formattedExtraPayments);
    setBankForm({
      bankName: staffData.bank_name || "",
      bankCode: staffData.bank_code || "",
      bankAccount: staffData.bank_account || "",
      bankHolder: staffData.bank_holder || "",
    });

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
  const monthExtraPayments = useMemo(() => {
    return extraPayments.filter(
      (item) =>
        item.staffId === selectedStaffId &&
        item.month === selectedMonth
    );
  }, [extraPayments, selectedStaffId, selectedMonth]);
  const extraSalary = {
    totalAmount: monthExtraPayments.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    ),
    paidAmount: monthExtraPayments
      .filter((item) => item.paid)
      .reduce((sum, item) => sum + item.totalAmount, 0),
    unpaidAmount: monthExtraPayments
      .filter((item) => !item.paid)
      .reduce((sum, item) => sum + item.totalAmount, 0),
    count: monthExtraPayments.length,
  };
  const orderSalaryAmount = enrichedOrders.reduce(
    (sum, order) => sum + order.salaryAmount,
    0
  );
  const orderPaidAmount = enrichedOrders
    .filter((order) => order.paid)
    .reduce((sum, order) => sum + order.salaryAmount, 0);
  const orderUnpaidAmount = enrichedOrders
    .filter((order) => !order.paid)
    .reduce((sum, order) => sum + order.salaryAmount, 0);
  const salary = {
    totalAmount:
      enrichedOrders.reduce((sum, order) => sum + order.amount, 0) +
      extraSalary.totalAmount,
    salaryAmount:
      orderSalaryAmount +
      extraSalary.totalAmount,
    companyAmount: enrichedOrders.reduce(
      (sum, order) => sum + order.companyAmount,
      0
    ),
    paidAmount:
      orderPaidAmount +
      extraSalary.paidAmount,
    unpaidAmount:
      orderUnpaidAmount +
      extraSalary.unpaidAmount,
    count:
      enrichedOrders.length +
      extraSalary.count,
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

  async function saveBankInfo() {
    if (!selectedStaff) return;

    const { error } = await supabase
      .from("players")
      .update({
        bank_name: bankForm.bankName.trim(),
        bank_code: bankForm.bankCode.trim(),
        bank_account: bankForm.bankAccount.trim(),
        bank_holder: bankForm.bankHolder.trim(),
        payment_method: `${bankForm.bankName.trim()} ${bankForm.bankCode.trim()} / ${bankForm.bankAccount.trim()} / ${bankForm.bankHolder.trim()}`,
      })
      .eq("discord_id", selectedStaff.id);

    if (error) {
      alert("儲存收款資料失敗");
      console.error(error);
      return;
    }

    setStaffList((prev) =>
      prev.map((staff) =>
        staff.id === selectedStaff.id
          ? {
              ...staff,
              paymentMethod: `${bankForm.bankName.trim()} ${bankForm.bankCode.trim()} / ${bankForm.bankAccount.trim()} / ${bankForm.bankHolder.trim()}`,
              bankName: bankForm.bankName.trim(),
              bankCode: bankForm.bankCode.trim(),
              bankAccount: bankForm.bankAccount.trim(),
              bankHolder: bankForm.bankHolder.trim(),
            }
          : staff
      )
    );

    alert("收款資料已儲存");
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
            <Card title="其他職位薪資">
              <ExtraPaymentTable items={monthExtraPayments} />
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
                <Info label="收款方式" value={selectedStaff?.paymentMethod || "未設定"} />
              </div>
            </Card>
            <Card title="收款資料">
              <div className="space-y-4">
               <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="銀行名稱"
                    value={bankForm.bankName}
                    onChange={(value) => setBankForm({ ...bankForm, bankName: value })}
                    placeholder="例如：台新銀行"
                  />

                  <Input
                    label="銀行代碼"
                    value={bankForm.bankCode}
                    onChange={(value) => setBankForm({ ...bankForm, bankCode: value })}
                    placeholder="例如：812"
                  />

                  <Input
                    label="銀行帳號"
                    value={bankForm.bankAccount}
                    onChange={(value) => setBankForm({ ...bankForm, bankAccount: value })}
                    placeholder="請輸入銀行帳號"
                  />

                  <Input
                    label="戶名"
                    value={bankForm.bankHolder}
                    onChange={(value) => setBankForm({ ...bankForm, bankHolder: value })}
                    placeholder="請輸入戶名"
                  />
                </div>

                <button
                  onClick={saveBankInfo}
                  className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
                >
                  儲存收款資料
                </button>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                  目前收款方式：
                  <span className="ml-1 text-zinc-100">
                    {selectedStaff?.paymentMethod || "未設定"}
                  </span>
                </div>
              </div>
            </Card>
            
            <Card title="說明">
              <div className="space-y-2 text-sm text-zinc-300">
                <p>常用銀行代碼：中信822台新812國泰013玉山808</p>
                <p>戶名為自己名字-為保實名轉帳-中間字可隱藏-EX：王O明</p>
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

function Input({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-zinc-400">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
      />
    </label>
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
              {order.paid ? "已發薪" : "未發薪"}
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
function ExtraPaymentTable({ items }: { items: ExtraPayment[] }) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
        目前沒有其他職位薪資
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="hidden grid-cols-6 bg-zinc-950 px-4 py-3 text-xs text-zinc-500 md:grid">
        <div>月份</div>
        <div>職位</div>
        <div>底薪</div>
        <div>件數</div>
        <div>總額</div>
        <div>狀態</div>
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          className="grid gap-2 border-t border-zinc-800 px-4 py-4 text-sm md:grid-cols-6 md:items-center"
        >
          <div className="text-zinc-400">{item.month}</div>
          <div className="font-semibold text-violet-200">{item.roleType}</div>
          <div className="text-zinc-300">
            {money(item.baseAmount)}
            {item.unitAmount > 0
              ? ` + ${money(item.unitAmount)} x ${item.count}`
              : ""}
          </div>
          <div className="text-zinc-300">{item.count}</div>
          <div className="font-bold text-violet-200">
            {money(item.totalAmount)}
          </div>
          <div>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                item.paid
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {item.paid ? "已發薪" : "未發薪"}
            </span>
          </div>

          {item.note && (
            <div className="text-xs text-zinc-500 md:col-span-6">
              備註：{item.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}