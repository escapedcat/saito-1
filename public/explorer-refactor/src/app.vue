<template>
  <div class="page">
    <router-view />
  </div>
</template>

<script>
// import Vue from 'vue'
import openSocket from 'socket.io-client';


export default {
  name: 'App',
  components: {
  },
  created() {
    const socket = openSocket('http://localhost:12101');
    // var socket = io.connect('http://localhost').listen('12101');
    console.log('socket', socket)
  },
  // secure
}

</script>
