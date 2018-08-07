<script>
// import Layout from '@layouts/main'
import toDate from 'date-fns/toDate'
import format from 'date-fns/format'
import ENV from './../../utils/getEnv'

export default {
  // components: { Layout },
  data() {
    return {
      block: null,
      transactions: null,
    }
  },
  computed: {
    blockDate() {
      return format(toDate(this.block.unixtime), 'yyyy-MM-dd hh:mm')
    },
  },
  watch: {
    // call again the method if the route changes
    $route: 'getBlock',
    block () {
      this.getTransactions()
    },
  },
  created() {
    this.getBlock()
  },
  methods: {
    getBlock() {
      const vm = this

      fetch(`${ENV.apiUrl}/explorer/json/block?hash=${this.$route.params.blockId}`).then(response => response.json().then((json) => {
        vm.block = json
      }))
    },
    getTransactions() {
      const vm = this

      if (!this.block.transactions.length) return
      const transactions = JSON.stringify(this.block.transactions)
      fetch(`${ENV.apiUrl}/explorer/json/transactions?transactions=${transactions}`).then(response => response.json().then((json) => {
        vm.transactions = json
      }))
    },
  },
}
</script>

<template>
  <!-- <Layout> -->
  <div>
    <router-link
      :to="{ name: 'blocks' }"
    >
      All Blocks
    </router-link>

    <div
      v-if="block"
      class="content"
    >
      <h1>
        Block: {{ this.$route.params.blockId }}
      </h1>

      <table class="list-blockdetail">
        <tr>
          <td>
            created
          </td>
          <td>
            {{ blockDate }}
          </td>
        </tr>
        <tr>
          <td>
            id
          </td>
          <td>
            {{ block.id }}
          </td>
        </tr>
        <tr>
          <td>
            previous block
          </td>
          <td v-if="block.prevhash">
            <router-link
              :to="{ name: 'block', params: { blockId: block.prevhash }}"
            >
              {{ block.prevhash }}
            </router-link>
          </td>
          <td v-else>
            ¯\_(ツ)_/¯
          </td>
        </tr>
        <tr>
          <td>
            merkle
          </td>
          <td>
            {{ block.merkle }}
          </td>
        </tr>
        <tr>
          <td>
            burn_fee
          </td>
          <td>
            {{ block.burn_fee }}
          </td>
        </tr>
        <tr>
          <td>
            coinbase
          </td>
          <td>
            {{ block.coinbase }}
          </td>
        </tr>
        <tr>
          <td>
            difficulty
          </td>
          <td>
            {{ block.difficulty }}
          </td>
        </tr>
        <tr>
          <td>
            fee_step
          </td>
          <td>
            {{ block.fee_step }}
          </td>
        </tr>

        <tr>
          <td>
            miner
          </td>
          <td>
            {{ block.miner }}
          </td>
        </tr>
        <tr>
          <td>
            paysplit
          </td>
          <td>
            {{ block.paysplit }}
          </td>
        </tr>
        <tr>
          <td>
            paysplit_vote
          </td>
          <td>
            {{ block.paysplit_vote }}
          </td>
        </tr>
        <tr>
          <td>
            reclaimed
          </td>
          <td>
            {{ block.reclaimed }}
          </td>
        </tr>
        <tr>
          <td>
            segadd
          </td>
          <td>
            {{ block.segadd }}
          </td>
        </tr>
        <tr>
          <td>
            treasury
          </td>
          <td>
            {{ block.treasury }}
          </td>
        </tr>
      </table>

      <h2>Transactions</h2>
      <ul>
        <li
          v-for="item in transactions"
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
              address: {{ item.address }}
            </li>
            <li>
              amount: {{ item.amount }}
            </li>
            <li>
              fee: {{ item.fee }}
            </li>
            <li>
              goldenticket: {{ item.goldenticket }}
            </li>
          </ul>
        </li>
      </ul>

    </div>

    <router-link
      :to="{ name: 'blocks' }"
    >
      All Blocks
    </router-link>

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
