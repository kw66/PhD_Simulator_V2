import type { RoleId } from "../core/v2-types";

const ROLE_CARD_PORTRAIT_URLS: Record<RoleId, string> = {
  normal: new URL("../../art/final_roles/set_20260329_v2/web/card/01_normal_upright_final_card.webp", import.meta.url).href,
  genius: new URL("../../art/final_roles/set_20260329_v2/web/card/02_genius_upright_final_card.webp", import.meta.url).href,
  social: new URL("../../art/final_roles/set_20260329_v2/web/card/03_social_upright_final_card.webp", import.meta.url).href,
  rich: new URL("../../art/final_roles/set_20260329_v2/web/card/04_rich_upright_final_card.webp", import.meta.url).href,
  "teacher-child": new URL("../../art/final_roles/set_20260329_v2/web/card/05_teacher_child_upright_final_card.webp", import.meta.url).href,
  chosen: new URL("../../art/final_roles/set_20260329_v2/web/card/06_chosen_upright_final_card.webp", import.meta.url).href,
  rewinder: new URL("../../art/final_roles/set_20260329_v2/web/card/07_rewinder_upright_final_card.webp", import.meta.url).href,
  "research-captain": new URL("../../art/final_roles/set_20260329_v2/web/card/08_research_captain_upright_final_card.webp", import.meta.url).href,
  "normal-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/01_normal_reversed_final_card.webp", import.meta.url).href,
  "genius-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/02_genius_reversed_final_card.webp", import.meta.url).href,
  "social-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/03_social_reversed_final_card.webp", import.meta.url).href,
  "rich-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/04_rich_reversed_final_card.webp", import.meta.url).href,
  "teacher-child-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/05_teacher_child_reversed_final_card.webp", import.meta.url).href,
  "chosen-reversed": new URL("../../art/final_roles/set_20260329_v2/web/card/06_chosen_reversed_final_card.webp", import.meta.url).href,
};

const ROLE_DETAIL_PORTRAIT_URLS: Record<RoleId, string> = {
  normal: new URL("../../art/final_roles/set_20260329_v2/web/detail/01_normal_upright_final_detail.webp", import.meta.url).href,
  genius: new URL("../../art/final_roles/set_20260329_v2/web/detail/02_genius_upright_final_detail.webp", import.meta.url).href,
  social: new URL("../../art/final_roles/set_20260329_v2/web/detail/03_social_upright_final_detail.webp", import.meta.url).href,
  rich: new URL("../../art/final_roles/set_20260329_v2/web/detail/04_rich_upright_final_detail.webp", import.meta.url).href,
  "teacher-child": new URL("../../art/final_roles/set_20260329_v2/web/detail/05_teacher_child_upright_final_detail.webp", import.meta.url).href,
  chosen: new URL("../../art/final_roles/set_20260329_v2/web/detail/06_chosen_upright_final_detail.webp", import.meta.url).href,
  rewinder: new URL("../../art/final_roles/set_20260329_v2/web/detail/07_rewinder_upright_final_detail.webp", import.meta.url).href,
  "research-captain": new URL("../../art/final_roles/set_20260329_v2/web/detail/08_research_captain_upright_final_detail.webp", import.meta.url).href,
  "normal-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/01_normal_reversed_final_detail.webp", import.meta.url).href,
  "genius-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/02_genius_reversed_final_detail.webp", import.meta.url).href,
  "social-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/03_social_reversed_final_detail.webp", import.meta.url).href,
  "rich-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/04_rich_reversed_final_detail.webp", import.meta.url).href,
  "teacher-child-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/05_teacher_child_reversed_final_detail.webp", import.meta.url).href,
  "chosen-reversed": new URL("../../art/final_roles/set_20260329_v2/web/detail/06_chosen_reversed_final_detail.webp", import.meta.url).href,
};

const WARMED_DETAIL_PORTRAITS = new Set<RoleId>();
const PENDING_DETAIL_PORTRAIT_WARMS = new Map<RoleId, Promise<void>>();

export function getRoleCardPortraitUrl(roleId: RoleId): string {
  return ROLE_CARD_PORTRAIT_URLS[roleId];
}

export function getRoleDetailPortraitUrl(roleId: RoleId): string {
  return ROLE_DETAIL_PORTRAIT_URLS[roleId];
}

export function warmRoleDetailPortrait(roleId: RoleId): Promise<void> {
  if (WARMED_DETAIL_PORTRAITS.has(roleId)) {
    return Promise.resolve();
  }

  const pending = PENDING_DETAIL_PORTRAIT_WARMS.get(roleId);
  if (pending) {
    return pending;
  }

  if (typeof Image === "undefined") {
    WARMED_DETAIL_PORTRAITS.add(roleId);
    return Promise.resolve();
  }

  const image = new Image();
  image.decoding = "async";
  image.setAttribute("fetchpriority", "low");

  const warmPromise = new Promise<void>((resolve) => {
    let settled = false;

    const finalize = () => {
      if (settled) {
        return;
      }

      settled = true;
      WARMED_DETAIL_PORTRAITS.add(roleId);
      PENDING_DETAIL_PORTRAIT_WARMS.delete(roleId);
      resolve();
    };

    const decodeImage = () => {
      image.decode().catch(() => undefined).finally(finalize);
    };

    image.addEventListener("load", decodeImage, { once: true });
    image.addEventListener("error", finalize, { once: true });
    image.src = getRoleDetailPortraitUrl(roleId);

    if (image.complete) {
      decodeImage();
    }
  });

  PENDING_DETAIL_PORTRAIT_WARMS.set(roleId, warmPromise);
  return warmPromise;
}

export function warmRoleDetailPortraits(roleIds: readonly RoleId[]): void {
  for (const roleId of roleIds) {
    void warmRoleDetailPortrait(roleId);
  }
}
