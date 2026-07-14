<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
const route = useRoute()
const clientId = computed(() => String(route.query.client_id || 'default-client'))
const { data: branding } = await useFetch<{ name: string, theme: { primaryColor?: string, backgroundColor?: string, logoUrl?: string } }>(() => `/api/public/client/${clientId.value}`)
const themeStyle = computed(() => ({
  '--mock-primary': branding.value?.theme.primaryColor || '#4f46e5',
  backgroundColor: branding.value?.theme.backgroundColor || undefined
}))
</script>

<template>
  <main class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-default p-4" :style="themeStyle">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--mock-primary),transparent_38%)] opacity-15" />
    <div class="relative w-full max-w-md">
      <div class="mb-6 flex items-center justify-center gap-3 text-highlighted">
        <img v-if="branding?.theme.logoUrl" :src="branding.theme.logoUrl" alt="" class="size-11 rounded-xl object-contain">
        <div v-else class="flex size-11 items-center justify-center rounded-xl bg-primary text-inverted shadow-lg">
          <UIcon name="i-lucide-shield-check" class="size-6" />
        </div>
        <span class="text-lg font-semibold">{{ branding?.name || 'Cognito Mock' }}</span>
      </div>
      <UPageCard :title="title" :description="description" class="shadow-xl">
        <slot />
      </UPageCard>
      <p class="mt-5 text-center text-xs text-muted">Development authentication service</p>
    </div>
  </main>
</template>
