<script setup lang="ts">
import { ja } from '@nuxt/ui/locale'

useHead({ htmlAttrs: { lang: 'ja' }, titleTemplate: title => title ? `${title} | Cognito Mock Example` : 'Cognito Mock Example' })
</script>

<template>
  <UApp :locale="ja">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
