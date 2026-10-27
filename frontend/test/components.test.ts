import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TagInput from "../src/components/ui/TagInput.vue";
import GroupFormModal from "../src/components/groups/GroupFormModal.vue";

const apiMocks = vi.hoisted(() => ({
  groups: { create: vi.fn(), rename: vi.fn() },
}));

vi.mock("../src/api", () => ({
  groupsApi: apiMocks.groups,
}));

const ModalStub = {
  props: ["open", "title", "busy"],
  template: '<div v-if="open" role="dialog" :aria-label="title"><slot /><slot name="footer" /></div>',
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("TagInput", () => {
  it("commits normalized tags on Enter, prevents duplicates, and removes tags", async () => {
    const wrapper = mount(TagInput, {
      props: { modelValue: ["existing"], suggestions: ["suggested"] },
    });
    const input = wrapper.get("input");
    await input.setValue("  incident, ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual(["existing", "incident"]);

    await input.setValue("EXISTING");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")).toHaveLength(1);

    await wrapper.get('button[aria-label="Remove tag existing"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([]);
    expect(wrapper.text()).toContain("suggested");
  });

  it("enforces tag count, length, comma parsing, and backspace removal", async () => {
    const wrapper = mount(TagInput, { props: { modelValue: [] } });
    const input = wrapper.get("input");
    await input.setValue("x".repeat(60));
    await input.trigger("keydown", { key: "," });
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual(["x".repeat(50)]);

    const fullTags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    const full = mount(TagInput, { props: { modelValue: fullTags } });
    expect((full.get("input").element as HTMLInputElement).disabled).toBe(true);
    const belowLimit = mount(TagInput, { props: { modelValue: fullTags.slice(0, 9) } });
    await belowLimit.get("input").trigger("keydown", { key: "Backspace" });
    expect(belowLimit.emitted("update:modelValue")?.[0]?.[0]).toEqual(Array.from({ length: 8 }, (_, i) => `tag${i}`));
  });
});

describe("GroupFormModal", () => {
  it("validates and creates a trimmed group, then emits saved and close", async () => {
    setActivePinia(createPinia());
    apiMocks.groups.create.mockResolvedValue({ id: 2, name: "Platform", createdAt: "today", role: "owner" });
    const wrapper = mount(GroupFormModal, {
      props: { open: true },
      global: { stubs: { Modal: ModalStub } },
    });
    const submit = wrapper.get('button[type="submit"]');
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get("#g-name").setValue("  Platform  ");
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.get("#group-form").trigger("submit");
    await flushPromises();

    expect(apiMocks.groups.create).toHaveBeenCalledWith("Platform");
    expect(wrapper.emitted("saved")?.[0]?.[0]).toMatchObject({ id: 2, name: "Platform", role: "owner" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("shows a save error and does not close the modal", async () => {
    setActivePinia(createPinia());
    apiMocks.groups.create.mockRejectedValue(new Error("Name already used"));
    const wrapper = mount(GroupFormModal, {
      props: { open: true },
      global: { stubs: { Modal: ModalStub } },
    });
    await wrapper.get("#g-name").setValue("Platform");
    await wrapper.get("#group-form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Name already used");
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(wrapper.emitted("saved")).toBeUndefined();
  });
});
