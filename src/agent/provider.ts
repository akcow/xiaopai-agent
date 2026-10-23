/** 模型运行时。把仓库里的 config/models.json 交给 Pi，缺 key 时给出能照做的报错。 */
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { MODEL_ID, MODEL_PROVIDER, MODELS_SRC, maskedKey } from "../config.js";

const PROVIDER_META: Record<string, { env: string; apply: string }> = {
  dashscope: {
    env: "DASHSCOPE_API_KEY",
    apply: "去 https://bailian.console.aliyun.com 开通百炼 → 右上角 API-KEY → 创建我的 API-KEY，把 sk- 开头的 key 写进 .env",
  },
  zhipu: {
    env: "ZHIPU_API_KEY",
    apply: "去 https://open.bigmodel.cn 注册 → 控制台 → API 密钥管理 → 新建，把 key 写进 .env",
  },
  deepseek: {
    env: "DEEPSEEK_API_KEY",
    apply: "去 https://platform.deepseek.com 创建 API key，写进 .env",
  },
};

let runtimePromise: Promise<ModelRuntime> | undefined;

export function configHint(): string {
  const meta = PROVIDER_META[MODEL_PROVIDER] ?? PROVIDER_META.dashscope!;
  return [
    `当前配置的模型是 ${MODEL_PROVIDER}/${MODEL_ID}，但环境变量 ${meta.env} 是空的。`,
    "",
    "两种处理方式：",
    `1) ${meta.apply}`,
    "2) 换其他 OpenAI 兼容端点：编辑 config/models.json 的 providers，再改 .env 里的 XIAOPAI_MODEL_PROVIDER",
  ].join("\n");
}

export async function getModelRuntime(): Promise<ModelRuntime> {
  runtimePromise ??= ModelRuntime.create({
    modelsPath: MODELS_SRC,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  return runtimePromise;
}

export async function loadModel(): Promise<{ runtime: ModelRuntime; model: Model<string> }> {
  const runtime = await getModelRuntime();
  const model = runtime.getModel(MODEL_PROVIDER, MODEL_ID);
  if (!model) {
    throw new Error(
      `config/models.json 里没有 ${MODEL_PROVIDER}/${MODEL_ID}。可用模型：${runtime
        .getModels()
        .map((m) => `${m.provider}/${m.id}`)
        .join(", ")}`,
    );
  }
  return { runtime, model: model as unknown as Model<string> };
}

export function assertApiKey(): void {
  const envName = (PROVIDER_META[MODEL_PROVIDER] ?? PROVIDER_META.dashscope!).env;
  if (!process.env[envName]) throw new Error(configHint());
}

export function describeModel(): string {
  const envName = (PROVIDER_META[MODEL_PROVIDER] ?? PROVIDER_META.dashscope!).env;
  return `${MODEL_PROVIDER}/${MODEL_ID} (${envName}=${maskedKey(envName)})`;
}
