/**
 * 汇率。用 open.er-api.com 的免费端点（无需 key），缓存 6 小时，
 * 接口挂了直接报错，绝不拿过期数据糊弄用户。
 */
export interface RateTable {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const CACHE = new Map<string, { at: number; table: RateTable }>();
const TTL = 6 * 60 * 60 * 1000;

interface RawRates {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
  "error-type"?: string;
}

export async function fetchRates(base: string): Promise<RateTable> {
  const code = base.trim().toUpperCase();
  const hit = CACHE.get(code);
  if (hit && Date.now() - hit.at < TTL) return hit.table;

  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(code)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`汇率接口返回 ${res.status}`);

  const json = (await res.json()) as RawRates;
  if (json.result !== "success" || !json.rates) {
    throw new Error(`汇率接口错误：${json["error-type"] ?? "未知"}`);
  }

  const table: RateTable = {
    base: json.base_code ?? code,
    date: json.time_last_update_utc ?? "",
    rates: json.rates,
  };
  CACHE.set(code, { at: Date.now(), table });
  return table;
}

export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
  rate: number;
  result: number;
  updatedAt: string;
}

export async function convertCurrency(amount: number, from: string, to: string): Promise<CurrencyConversion> {
  const table = await fetchRates(from);
  const target = to.trim().toUpperCase();
  const rate = table.rates[target];
  if (!rate) {
    throw new Error(`不支持的货币代码"${to}"，请用 ISO 代码，例如 CNY / USD / JPY / EUR。`);
  }
  return {
    amount,
    from: table.base,
    to: target,
    rate,
    result: Math.round(amount * rate * 100) / 100,
    updatedAt: table.date,
  };
}

/** 供单测用的纯函数：给定汇率表直接算 */
export function applyRate(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}
