<script>
// import Layout from '@layouts/main'

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

      fetch('http://localhost:12101/explorer/json/blocks').then(response => response.json().then((json) => {
        vm.blocks = json
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