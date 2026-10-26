<script lang="ts">
let hasRevealedChart = false;
</script>

<script setup lang="ts">
import { APP_NAME } from "@/config";
import BrandMark from "./BrandMark.vue";

defineProps<{ title: string; subtitle: string }>();

const revealChart = !hasRevealedChart;
hasRevealedChart = true;
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
    <!-- A miniature of the product's own timeline: a release, then the incident that followed it. -->
    <aside class="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-12 lg:flex">
      <div class="flex items-center gap-2.5">
        <BrandMark :size="32" />
        <span class="text-xl font-extrabold tracking-tight">{{ APP_NAME }}</span>
      </div>

      <div>
        <h2 class="max-w-md text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
          Every release and incident, in order.
        </h2>
        <p class="mt-4 max-w-sm text-base leading-7 text-ink-soft">
          See what happened and when it happened.
        </p>

        <div :class="[revealChart && 'reveal', 'mt-10 max-w-[34rem]']">
          <svg viewBox="0 0 520 250" class="w-full" role="img" aria-label="Example timeline with releases and incidents across three groups">
            <g font-size="11" font-weight="600" fill="var(--muted)">
              <text x="0" y="52">Payments</text>
              <text x="0" y="122">Platform</text>
              <text x="0" y="192">Mobile</text>
            </g>
            <g stroke="var(--line)" stroke-width="1">
              <path d="M0 84H520M0 154H520M0 224H520" />
              <path d="M110 12V232M210 12V232M310 12V232M410 12V232" stroke-opacity=".6" />
            </g>
            <!-- release hairlines run through every lane -->
            <g stroke="var(--release)" stroke-width="1.25" stroke-dasharray="3 4" opacity=".55">
              <path d="M170 12V232M300 12V232M430 12V232" />
            </g>
            <!-- Payments -->
            <rect x="184" y="38" width="104" height="24" rx="6" fill="color-mix(in srgb, var(--incident) 16%, transparent)" stroke="var(--incident)" stroke-width="1.5" />
            <text x="194" y="54" font-size="11" font-weight="600" fill="var(--ink)">Checkout errors</text>
            <path d="M300 40l9 9-9 9-9-9z" fill="var(--release)" />
            <!-- Platform -->
            <path d="M170 108l9 9-9 9-9-9z" fill="var(--release)" />
            <rect x="330" y="108" width="70" height="24" rx="6" fill="color-mix(in srgb, var(--incident) 16%, transparent)" stroke="var(--incident)" stroke-width="1.5" />
            <text x="340" y="124" font-size="11" font-weight="600" fill="var(--ink)">DB lag</text>
            <!-- Mobile -->
            <path d="M430 178l9 9-9 9-9-9z" fill="var(--release)" />
            <path d="M240 196l8 14h-16z" fill="var(--incident)" stroke="var(--incident)" stroke-width="2" stroke-linejoin="round" />
            <!-- axis -->
            <g font-size="10.5" fill="var(--muted)">
              <text x="110" y="246" text-anchor="middle">Mon</text>
              <text x="210" y="246" text-anchor="middle">Tue</text>
              <text x="310" y="246" text-anchor="middle">Wed</text>
              <text x="410" y="246" text-anchor="middle">Thu</text>
            </g>
          </svg>
        </div>
      </div>

      <p class="text-sm text-muted">Shared by the teams that ship and the teams that get paged.</p>
    </aside>

    <section class="flex items-center justify-center px-5 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark :size="30" />
          <span class="text-xl font-extrabold tracking-tight">{{ APP_NAME }}</span>
        </div>
        <h1 class="text-[1.7rem] font-extrabold tracking-tight">{{ title }}</h1>
        <p class="mt-1.5 text-sm text-ink-soft">{{ subtitle }}</p>
        <div class="mt-7"><slot /></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* The one orchestrated moment on the page: the chart is drawn left to right, once. */
.reveal {
  animation: reveal 1.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.15s both;
}
@keyframes reveal {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(0 0 0 0);
  }
}
</style>
