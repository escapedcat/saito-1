<script>
// import Layout from '@layouts/main'
import ENV from './../../utils/getEnv'

export default {
  // components: { Layout },
  data() {
    return {
      blocks: [],
    }
  },
  created() {
    this.getBlocks()
  },
  methods: {
    getBlocks() {
      const vm = this

      fetch(`${ENV.apiUrl}/explorer/json/blocks`).then(response => response.json().then((json) => {
        const data = json
        vm.blocks = data.slice().reverse()
      }))
    },
  },
}
</script>

<template>
  <!-- <Layout> -->
  <div>

    <h1>Blocks</h1>

    <ul class="list-block">
      <li
        v-for="item in blocks"
        :key="item.id"
        :class="{
          'is-longest': item.isLongest,
        }"
        tabindex="0"
      >
        <router-link
          :to="{ name: 'block', params: { blockId: item.hash }}"
        >
          <ul>
            <li>
              id: {{ item.id }}
            </li>
            <li>
              hash: {{ item.hash }}
            </li>
            <li v-if="item.prevHash">
              previous hash: {{ item.prevHash }}
            </li>
            <li v-else>
              ¯\_(ツ)_/¯
            </li>
          </ul>
        </router-link>
      </li>
    </ul>

  </div>
  <!-- </Layout> -->
</template>

<!--
<style lang="scss" scoped>
  .list-block {
    background: red;
  }
</style>
-->
