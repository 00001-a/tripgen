import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import PlanView from '../views/PlanView.vue';
import HistoryView from '../views/HistoryView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/plan', name: 'plan', component: PlanView },
    { path: '/history', name: 'history', component: HistoryView },
  ],
});

export default router;
