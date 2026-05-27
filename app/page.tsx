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
  paid: boolean;        // 客人是否付款
  salaryPaid: boolean;  // 員工是否已發薪
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
  salaryPaid: boolean;
};
const OPENING_END_DATE = "2026-09-01";
const MANAGER_START_DATE = "2026-05-01";

function money(value: number) {
  return `NT$ ${value.toLocaleString("zh-TW")}`;
}

function getMonth(date?: string | null) {
  if (!date) return "";
  return String(date).slice(0, 7);
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
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [notAdmin, setNotAdmin] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("2026-05");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [payForm, setPayForm] = useState({
    staffId: "",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
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
  const [extraPayForm, setExtraPayForm] = useState({
    staffId: "",
    month: new Date().toISOString().slice(0, 7),
    roleType: "接待",
    count: "0",
    amount: "300",
    note: "",
  });
  const [editingExtraId, setEditingExtraId] = useState<number | null>(null);
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
    const { data: extraData, error: extraError } = await supabase
      .from("staff_extra_payments")
      .select("*")
      .order("created_at", { ascending: false }); 
    if (staffError) {
      console.error("讀取員工失敗", staffError);
    }
    if (orderError) {
      console.error("讀取訂單失敗", JSON.stringify(orderError, null, 2));
    }
    if (extraError) {
      console.error("讀取其他職位薪資失敗", extraError);
    }
    const formattedStaff: Staff[] = (staffData || []).map((item) => ({
      id: item.discord_id,
      name: item.name || item.discord_id,
      staffType: item.staff_type || "陪陪人員",
      rank: item.rank || "新手",
      paymentMethod: item.payment_method || "未設定",
    }));
    const formattedOrders: Order[] = (orderData || [])
      .filter((item) => item.assigned_player)
      .flatMap((item) => {
        const assignedPlayers = String(item.assigned_player || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
        const splitCount = assignedPlayers.length || 1;
        const originalAmount = Number(item.final_price || item.price || 0);
        const splitAmount = Math.round(originalAmount / splitCount);
        return assignedPlayers.map((staffId) => ({
          id: item.id,
          date:
            item.completed_at?.slice(0, 10) ||
            item.accepted_at?.slice(0, 10) ||
            item.created_at?.slice(0, 10) ||
            "",
          staffId,
          customer:
            item.customer_name ||
            item.customer_username ||
            item.username ||
            item.nickname ||
            item.customer_id ||
            "未填寫",
          orderType:
            String(item.service || "").startsWith("打賞：")
              ? "打賞"
              : "訂單",
          item:
            splitCount > 1
              ? `${item.game || ""}：${item.service || "未填寫"}｜${splitCount}人平分`
              : `${item.game || ""}：${item.service || "未填寫"}`,
          amount: splitAmount,
          paid: Boolean(item.paid),
          salaryPaid: Boolean(item.salary_paid),
        }));
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
      salaryPaid: Boolean(item.salary_paid),
    }));
    setStaffList(formattedStaff);
    setOrders(formattedOrders);
    setExtraPayments(formattedExtraPayments);
    if (formattedStaff.length > 0) {
      setSelectedStaffId(formattedStaff[0].id);
      setPayForm((prev) => ({
        ...prev,
        staffId: formattedStaff[0].id,
      }));
      setOrderForm((prev) => ({
        ...prev,
        staffId: formattedStaff[0].id,
      }));
      setExtraPayForm((prev) => ({
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

  const selectedStaff = staffMap[selectedStaffId];

  const payslipOrders = monthOrders.filter((order) => order.staffId === selectedStaffId);
  const monthExtraPayments = extraPayments.filter(
    (item) => item.month === selectedMonth
  );
  const payslipExtraPayments = monthExtraPayments.filter(
    (item) => item.staffId === selectedStaffId
  );
  const dashboardExtra = {
    totalAmount: monthExtraPayments.reduce((sum, item) => sum + item.totalAmount, 0),
    unpaidSalary: monthExtraPayments
      .filter((item) => !item.salaryPaid)
      .reduce((sum, item) => sum + item.totalAmount, 0),
    count: monthExtraPayments.length,
  };
  const dashboard = {
    totalAmount:
      monthOrders.reduce((sum, order) => sum + order.amount, 0) +
      dashboardExtra.totalAmount,
    totalSalary:
      monthOrders.reduce((sum, order) => sum + order.salaryAmount, 0) +
      dashboardExtra.totalAmount,
    totalCompany: monthOrders.reduce((sum, order) => sum + order.companyAmount, 0),
    unpaidSalary:
      monthOrders.filter((order) => !order.salaryPaid).reduce((sum, order) => sum + order.salaryAmount, 0) +
      dashboardExtra.unpaidSalary,
    orderCount: monthOrders.length + dashboardExtra.count,
  };
  const payslipExtra = {
    totalAmount: payslipExtraPayments.reduce((sum, item) => sum + item.totalAmount, 0),
    paidAmount: payslipExtraPayments
      .filter((item) => item.salaryPaid)
      .reduce((sum, item) => sum + item.totalAmount, 0),
    unpaidAmount: payslipExtraPayments
      .filter((item) => !item.salaryPaid)
      .reduce((sum, item) => sum + item.totalAmount, 0),
    count: payslipExtraPayments.length,
  };
  const payslip = {
    totalAmount:
      payslipOrders.reduce((sum, order) => sum + order.amount, 0) +
      payslipExtra.totalAmount,
    salaryAmount:
      payslipOrders.reduce((sum, order) => sum + order.salaryAmount, 0) +
      payslipExtra.totalAmount,
    companyAmount: payslipOrders.reduce((sum, order) => sum + order.companyAmount, 0),
    paidAmount:
      payslipOrders.filter((order) => order.salaryPaid).reduce((sum, order) => sum + order.salaryAmount, 0) +
      payslipExtra.paidAmount,
    unpaidAmount:
      payslipOrders.filter((order) => !order.salaryPaid).reduce((sum, order) => sum + order.salaryAmount, 0) +
      payslipExtra.unpaidAmount,
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
    if (!orderForm.staffId) {
      alert("請選擇人員");
      return;
    }
    if (!orderForm.customer.trim()) {
      alert("請輸入客人名稱");
      return;
    }
    if (!orderForm.item.trim()) {
      alert("請輸入項目");
      return;
    }
    const amount = Number(orderForm.amount);
    if (!amount || amount <= 0) {
      alert("請輸入正確金額");
      return;
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("play_orders")
      .insert({
        order_no: `MANUAL-${Date.now()}`,
        customer_id: orderForm.customer.trim(),
        customer_username: orderForm.customer.trim(),
        channel_id: `manual-${Date.now()}`,
        assigned_player: orderForm.staffId,
        service:
          orderForm.orderType === "打賞"
            ? `打賞：${orderForm.item.trim()}`
            : orderForm.item.trim(),
        price: amount,
        final_price: amount,
        discount_rate: 1,
        discount_amount: 0,
        payment_method: "手動新增",
        paid: orderForm.paid,
        paid_at: orderForm.paid ? now : null,
        salary_paid: false,
        salary_paid_at: null,
        status: "completed",
        completed_at: `${orderForm.date}T12:00:00.000Z`,
        accepted_at: `${orderForm.date}T12:00:00.000Z`,
        note: orderForm.orderType,
      })
      .select()
      .single();
    if (error) {
      console.error("新增訂單失敗", error);
      alert(error.message || "新增訂單失敗");
      return;
    }
    const newOrder: Order = {
      id: data.id,
      date:
        data.completed_at?.slice(0, 10) ||
        data.accepted_at?.slice(0, 10) ||
        data.created_at?.slice(0, 10) ||
        orderForm.date,
      staffId: data.assigned_player,
      customer:
        data.customer_id ||
        orderForm.customer.trim(),
      orderType: orderForm.orderType,
      item:
        orderForm.orderType === "打賞"
          ? `打賞：${orderForm.item.trim()}`
          : data.service,
      amount: Number(data.final_price || data.price || amount),
      paid: Boolean(data.paid),
      salaryPaid: Boolean(data.salary_paid),
    };
    setOrders([...orders, newOrder]);
    setOrderForm({
      ...orderForm,
      customer: "",
      item: "",
      amount: "",
      paid: false,
    });
    alert("新增成功");
  }
  async function addExtraPayment() {
    if (!extraPayForm.staffId) {
      alert("請選擇人員");
      return;
    }
    const count = Number(extraPayForm.count || 0);
    const amount = Number(extraPayForm.amount || 0);
    let baseAmount = 0;
    let unitAmount = 0;
    let finalCount = count;
    let totalAmount = 0;
    if (extraPayForm.roleType === "接待") {
      baseAmount = 350;
      unitAmount = 5;
      totalAmount = baseAmount + unitAmount * finalCount;
    }
    if (extraPayForm.roleType === "行銷") {
      baseAmount = amount;
      unitAmount = 0;
      finalCount = 0;
      totalAmount = baseAmount;
    }
    if (extraPayForm.roleType === "技術審核官") {
      baseAmount = 0;
      unitAmount = 150;
      totalAmount = unitAmount * finalCount;
    }
    if (extraPayForm.roleType === "娛樂審核官") {
      baseAmount = 0;
      unitAmount = 100;
      totalAmount = unitAmount * finalCount;
    }
    if (extraPayForm.roleType === "獎金") {
        baseAmount = amount;
        unitAmount = 0;
        finalCount = 0;
        totalAmount = baseAmount;
      }
    if (extraPayForm.roleType === "其他") {
        baseAmount = amount;
        unitAmount = 0;
        finalCount = 0;
        totalAmount = baseAmount;
      }
    if (totalAmount <= 0) {
      alert("金額或人數不可為 0");
      return;
    }
    const payload = {
      staff_id: extraPayForm.staffId,
      month: extraPayForm.month,
      role_type: extraPayForm.roleType,
      base_amount: baseAmount,
      unit_amount: unitAmount,
      count: finalCount,
      total_amount: totalAmount,
      note: extraPayForm.note,
    };
    const query = editingExtraId
      ? supabase
          .from("staff_extra_payments")
          .update(payload)
          .eq("id", editingExtraId)
          .select()
          .single()
      : supabase
          .from("staff_extra_payments")
          .insert({
            ...payload,
            salary_paid: false,
          })
          .select()
          .single();
    const { data, error } = await query;
    if (error) {
      console.error("新增其他薪資失敗", error);
      alert(error.message || "儲存其他薪資失敗");
      return;
    }
    const newExtraPayment: ExtraPayment = {
      id: data.id,
      staffId: data.staff_id,
      month: data.month,
      roleType: data.role_type,
      baseAmount: Number(data.base_amount || 0),
      unitAmount: Number(data.unit_amount || 0),
      count: Number(data.count || 0),
      totalAmount: Number(data.total_amount || 0),
      note: data.note || "",
      salaryPaid: Boolean(data.salary_paid),
    };
    if (editingExtraId) {
      setExtraPayments((prev) =>
        prev.map((item) =>
          item.id === editingExtraId ? newExtraPayment : item
        )
      );
    } else {
      setExtraPayments([...extraPayments, newExtraPayment]);
    }
    setExtraPayForm({
      ...extraPayForm,
      count: "0",
      amount: "300",
      note: "",
    });
    setEditingExtraId(null);
    alert(editingExtraId ? "已修改其他薪資" : "已新增其他薪資");
  }
  async function deleteExtraPayment(id: number) {
    const ok = confirm("確定要刪除這筆其他薪資嗎？刪除後無法復原。");
    if (!ok) return;
    const { error } = await supabase
      .from("staff_extra_payments")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("刪除其他薪資失敗", error);
      alert(error.message || "刪除其他薪資失敗");
      return;
    }
    setExtraPayments((prev) =>
      prev.filter((item) => item.id !== id)
    );
    alert("已刪除其他薪資");
  }
  function startEditExtraPayment(item: ExtraPayment) {
    setEditingExtraId(item.id);
    setExtraPayForm({
      staffId: item.staffId,
      month: item.month,
      roleType: item.roleType,
      count: String(item.count || 0),
      amount: String(item.baseAmount || item.totalAmount || 0),
      note: item.note || "",
    });
    setActivePage("orders");
  }
  async function deleteOrder(orderId: number) {
    const ok = confirm("確定要刪除這筆訂單 / 打賞紀錄嗎？刪除後無法復原。");
    if (!ok) return;
    const { error } = await supabase
      .from("play_orders")
      .delete()
      .eq("id", orderId);
    if (error) {
      console.error("刪除訂單失敗", error);
      alert(error.message || "刪除訂單失敗");
      return;
    }
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
    alert("已刪除訂單");
  }
  async function toggleCustomerPaid(orderId: number, currentPaid: boolean) {
    const nextPaid = !currentPaid;
    const { error } = await supabase
      .from("play_orders")
      .update({
        paid: nextPaid,
        paid_at: nextPaid ? new Date().toISOString() : null,
      })
      .eq("id", orderId);
    if (error) {
      console.error("更新客人付款狀態失敗", error);
      alert(error.message || "更新客人付款狀態失敗");
      return;
    }
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              paid: nextPaid,
            }
          : order
      )
    );
    alert(nextPaid ? "已標記客人已付款" : "已標記客人未付款");
  }
  function copyPayslip() {
    const text = `
深夜不關燈 薪資單

陪陪名稱：${selectedStaff?.name || "-"}
人員類型：${selectedStaff?.staffType || "-"}
等級：${selectedStaff?.rank || "-"}
結算月份：${selectedMonth}

總筆數：${payslipOrders.length + payslipExtra.count} 筆
總金額：${money(payslip.totalAmount)}
薪資實拿：${money(payslip.salaryAmount)}
公司收入：${money(payslip.companyAmount)}

已發薪：${money(payslip.paidAmount)}
未發薪：${money(payslip.unpaidAmount)}

深夜不關燈 管理系統
      `.trim();

  navigator.clipboard.writeText(text);
    alert("薪資單已複製");
  }
  async function markSalaryPaid() {
    if (!payForm.staffId) {
      alert("請選擇人員");
      return;
    }
    if (!payForm.startDate || !payForm.endDate) {
      alert("請選擇發薪時間段");
      return;
    }
    const confirmText = `確定要把這位人員在 ${payForm.startDate} 到 ${payForm.endDate} 的薪資標記為已付款嗎？`;
    if (!confirm(confirmText)) return;
    const { error } = await supabase
      .from("play_orders")
      .update({
        salary_paid: true,
        salary_paid_at: new Date().toISOString(),
      })
      .eq("assigned_player", payForm.staffId)
      .gte("completed_at", `${payForm.startDate}T00:00:00`)
      .lte("completed_at", `${payForm.endDate}T23:59:59`);
    const startMonth = payForm.startDate.slice(0, 7);
    const endMonth = payForm.endDate.slice(0, 7);
    const { error: extraPayError } = await supabase
      .from("staff_extra_payments")
      .update({
        salary_paid: true,
        salary_paid_at: new Date().toISOString(),
      })
      .eq("staff_id", payForm.staffId)
      .gte("month", startMonth)
      .lte("month", endMonth);
    if (extraPayError) {
      alert("訂單已標記，但其他薪資標記失敗");
      console.error(extraPayError);
      return;
    }
    if (error) {
      alert("標記已付款失敗");
      console.error(error);
      return;
    }
    setOrders((prev) =>
      prev.map((order) => {
        const inRange =
          order.staffId === payForm.staffId &&
          order.date >= payForm.startDate &&
          order.date <= payForm.endDate;
        return inRange
          ? {
              ...order,
              salaryPaid: true,
            }
          : order;
      })
    );
    setExtraPayments((prev) =>
      prev.map((item) => {
        const inRange =
          item.staffId === payForm.staffId &&
          item.month >= startMonth &&
          item.month <= endMonth;
        return inRange
          ? {
              ...item,
              salaryPaid: true,
            }
          : item;
      })
    );
    alert("已標記為已付款");
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
              <Stat title="未付款" value={money(dashboard.unpaidSalary)} danger />
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
            <div className="space-y-6">
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
                  已付款
                </label>

                <button onClick={addOrder} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600">
                  <Plus size={18} />
                  新增紀錄
                </button>
              </div>
            </Card>
            <Card title="其他薪資">
              <div className="space-y-4">
                <label className="block text-sm text-zinc-400">
                  人員
                  <select
                    value={extraPayForm.staffId}
                    onChange={(e) =>
                      setExtraPayForm({ ...extraPayForm, staffId: e.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                  >
                    {staffList.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                        {staff.name}｜{staff.staffType}｜{staff.rank}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  type="month"
                  label="月份"
                  value={extraPayForm.month}
                  onChange={(value) =>
                    setExtraPayForm({ ...extraPayForm, month: value })
                  }
                />
                <Select
                  label="職位"
                  value={extraPayForm.roleType}
                  onChange={(value) =>
                    setExtraPayForm({ ...extraPayForm, roleType: value })
                  }
                  options={["接待", "行銷", "技術審核官", "娛樂審核官", "獎金", "其他"]}
                />
                {["行銷", "獎金", "其他"].includes(extraPayForm.roleType) ? (
                  <Input
                    type="number"
                    label={
                      extraPayForm.roleType === "行銷"
                        ? "行銷月薪金額"
                        : extraPayForm.roleType === "獎金"
                          ? "獎金金額"
                          : "其他金額"
                    }
                    value={extraPayForm.amount}
                    onChange={(value) =>
                      setExtraPayForm({ ...extraPayForm, amount: value })
                    }
                  />
                ) : (
                  <Input
                    type="number"
                    label={
                      extraPayForm.roleType === "接待"
                        ? "接待人數"
                        : "審核人數"
                    }
                    value={extraPayForm.count}
                    onChange={(value) =>
                      setExtraPayForm({ ...extraPayForm, count: value })
                    }
                  />
                )}
                <Input
                  label="備註"
                  value={extraPayForm.note}
                  onChange={(value) =>
                    setExtraPayForm({ ...extraPayForm, note: value })
                 }
                />

                <button
                  onClick={addExtraPayment}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-semibold hover:bg-violet-600"
                >
                  <Plus size={18} />
                  {editingExtraId ? "儲存修改" : "新增其他薪資"}
                </button>
                {editingExtraId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExtraId(null);
                      setExtraPayForm({
                        ...extraPayForm,
                        count: "0",
                        amount: "300",
                        note: "",
                      });
                    }}
                    className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    取消修改
                  </button>
                )}
              </div>
            </Card>
            </div>
            <Card title="訂單紀錄">
              <OrderTable
                orders={enrichedOrders.slice().reverse()}
                onDeleteOrder={deleteOrder}
                onToggleCustomerPaid={toggleCustomerPaid}
              />
            </Card>
          </section>
        )}

        {activePage === "payslip" && (
          <section className="grid gap-6 md:grid-cols-[360px_1fr]">
            <Card title="批次發薪">
              <div className="space-y-4">
                <label className="block text-sm text-zinc-400">
                  選擇發薪人員
                  <select
                    value={payForm.staffId}
                    onChange={(e) => setPayForm({ ...payForm, staffId: e.target.value })}
                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-white"
                  >
                    {staffList.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}｜{staff.staffType}｜{staff.rank}
                      </option>
                    ))}
                  </select>
                </label>

                <Input
                  type="date"
                  label="開始日期"
                  value={payForm.startDate}
                  onChange={(value) => setPayForm({ ...payForm, startDate: value })}
                />

                <Input
                  type="date"
                  label="結束日期"
                  value={payForm.endDate}
                  onChange={(value) => setPayForm({ ...payForm, endDate: value })}
                />

                <button
                  onClick={markSalaryPaid}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold hover:bg-emerald-600"
                >
                  標記這段時間已付款
                </button>

                <p className="text-xs text-zinc-500">
                  會把此人員在指定日期內的訂單標記為已付款，並寫入付款時間。
                </p>
              </div>
            </Card>
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
                  <Stat title="已發薪" value={money(payslip.paidAmount)} />
                  <Stat title="未發薪" value={money(payslip.unpaidAmount)} danger />
                  <Stat title="筆數" value={`${payslipOrders.length + payslipExtra.count} 筆`} />
                </div>

                <OrderTable orders={payslipOrders} />
                <ExtraPaymentTable
                  items={payslipExtraPayments}
                  onEdit={startEditExtraPayment}
                  onDelete={deleteExtraPayment}
                />
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

function OrderTable({
  orders,
  onDeleteOrder,
  onToggleCustomerPaid,
}: {
  orders: any[];
  onDeleteOrder?: (orderId: number) => void;
  onToggleCustomerPaid?: (orderId: number, currentPaid: boolean) => void;
}) {
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
        <div>付款 / 發薪</div>
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
          <div className="flex flex-col gap-1">
            <span
              className={`w-fit rounded-full px-2 py-1 text-xs ${
                order.paid
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              客人：{order.paid ? "已付款" : "未付款"}
            </span>
            <span
              className={`w-fit rounded-full px-2 py-1 text-xs ${
                order.salaryPaid
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              員工：{order.salaryPaid ? "已發薪" : "未發薪"}
            </span>
          </div>

          <div className="md:col-span-8 flex flex-col gap-2 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
            <span>
              {order.ruleName}｜人員 {order.salaryRate}%｜公司 {order.companyRate}%
            </span>
            <div className="flex flex-wrap gap-2">
              {onToggleCustomerPaid && (
                <button
                  type="button"
                  onClick={() => onToggleCustomerPaid(order.id, order.paid)}
                  className="w-fit rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                >
                  {order.paid ? "改為客人未付款" : "改為客人已付款"}
                </button>
              )}
              {onDeleteOrder && (
                <button
                  type="button"
                  onClick={() => onDeleteOrder(order.id)}
                  className="w-fit rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/30"
                >
                  刪除
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
function ExtraPaymentTable({
  items,
  onEdit,
  onDelete,
}: {
  items: ExtraPayment[];
  onEdit?: (item: ExtraPayment) => void;
  onDelete?: (id: number) => void;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
        目前沒有其他薪資
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
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
            {item.unitAmount > 0 ? ` + ${money(item.unitAmount)} x ${item.count}` : ""}
          </div>
          <div className="text-zinc-300">{item.count}</div>
          <div className="font-bold text-violet-200">{money(item.totalAmount)}</div>
          <div>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                item.salaryPaid
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {item.salaryPaid ? "已發薪" : "未發薪"}
            </span>
          </div>

          {item.note && (
            <div className="text-xs text-zinc-500 md:col-span-6">
              備註：{item.note}
            </div>
          )}
          {(onEdit || onDelete) && (
            <div className="flex gap-2 text-xs md:col-span-6">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="rounded-lg bg-sky-500/20 px-3 py-1 font-semibold text-sky-300 hover:bg-sky-500/30"
                >
                  修改
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="rounded-lg bg-rose-500/20 px-3 py-1 font-semibold text-rose-300 hover:bg-rose-500/30"
                >
                  刪除
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}