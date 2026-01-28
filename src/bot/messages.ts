export const MESSAGES = {
  // Common
  back: '🔙 Orqaga',
  error: 'Xatolik yuz berdi.',
  session_expired: 'Sessiya muddati tugadi.',
  channel_not_found: 'Kanal topilmadi.',
  page: (current: number, total: number) => `Sahifa ${current}/${total}`,
  ignore: 'ignore',

  // Subscription
  subscribe_first: "⚠️ Avval kanallarga obuna bo'ling!",
  not_subscribed_all: "❌ Siz barcha kanallarga obuna bo'lmagansiz!",
  must_subscribe:
    "⚠️ Botdan foydalanish uchun quyidagi kanallarga obuna bo'lishingiz shart:",
  check_subscription_btn: "✅ Obuna bo'ldim",
  access_granted: '✅ Kirishga ruxsat berildi!',
  welcome_back: "Xush kelibsiz! Boshlash uchun /start buyrug'ini bosing.",

  // User Main Menu
  welcome: (name: string) => `Xush kelibsiz ${name}! Bo'limni tanlang:`,
  welcome_user_mode: (name: string) => `Xush kelibsiz ${name}!`,
  search_movie_btn: "🔍 Kod bo'yicha qidirish",
  random_movie_btn: '🎲 Tasodifiy film',
  contact_feedback_btn: "📞 Bog'lanish / Fikr-mulohaza",
  admin_panel_btn: '👑 Admin panel',

  // Search
  ask_movie_code: 'Iltimos, filmning raqamli kodini yuboring:',
  invalid_code: '❌ Iltimos, haqiqiy raqamli kod yuboring.',
  movie_not_found: '❌ Bunday kodli film topilmadi.',
  movie_caption: (title: string) => `🎬 *${title}*`,
  movie_caption_with_code: (title: string, code: number) =>
    `🎬 *${title}* (Kod: \`${code}\`)`,

  // Feedback
  ask_feedback: 'Iltimos, fikr-mulohazangizni yoki savolingizni yuboring:',
  feedback_sent: '✅ Fikr-mulohaza yuborildi!',
  new_feedback_admin: (username: string, userId: string, message: string) =>
    `📨 @${username} (${userId}) dan yangi fikr-mulohaza:\n${message}`,

  // Admin
  admin_panel_title:
    "👑 *Admin panel*\nBotni boshqarish uchun bo'limni tanlang.",
  stats_btn: '📊 Statistika',
  users_btn: '👥 Foydalanuvchilar',
  movies_btn: '🎬 Filmlar',
  channels_btn: '📢 Kanallar',
  feedbacks_btn: '📨 Muammolar',
  admins_btn: '👑 Adminlar',
  user_mode_btn: '👤 Foydalanuvchi rejimi',

  stats_text: (users: number, movies: number, views: number | bigint) =>
    `📊 *Statistika*\n\n👥 Foydalanuvchilar: ${users}\n🎬 Filmlar: ${movies}\n👀 Umumiy ko'rishlar: ${views}`,

  // Admin - Feedbacks
  no_feedbacks: "Hal qilinmagan muammolar yo'q.",
  no_feedbacks_msg: "✅ Hozirda hal qilinmagan fikr-mulohazalar yo'q.",
  resolve_btn: '✅ Hal qilish',
  delete_btn: "🗑️ O'chirish",
  feedback_detail: (userTag: string, message: string, date: string) =>
    `📩 *${userTag} dan fikr-mulohaza*\n\n"${message}"\n\n_Yuborilgan vaqt: ${date}_`,
  feedback_action_prompt:
    'Yuqoridagi fikr-mulohazalar uchun amalni tanlang yoki panelga qayting:',
  marked_resolved: 'Hal qilingan deb belgilandi.',
  resolved_status: '\n\n✅ *HAL QILINDI*',
  deleted_feedback: "Fikr-mulohaza o'chirildi.",

  // Admin - Channels
  manage_channels_title:
    "📢 *Kanallarni boshqarish*\nKanalni tanlang yoki yangisini qo'shing:",
  add_channel_btn: "➕ Kanal qo'shish",
  ask_channel_id: "Iltimos, kanal ID'sini yuboring (masalan, -100...).",
  invalid_channel_id: "ID formati noto'g'ri. Iltimos, raqamli ID yuboring.",
  channel_added: (title: string, link: string) =>
    `✅ Kanal qo'shildi!\nSarlavha: ${title}\nHavola: ${link}`,
  channel_added_simple: "✅ Kanal qo'shildi.",
  ask_channel_link:
    "Taklif havolasini avtomatik olib bo'lmadi. Iltimos, qo'lda yuboring.",
  edit_title_btn: '✏️ Sarlavhani tahrirlash',
  edit_link_btn: '✏️ Havolani tahrirlash',
  delete_channel_btn: "🗑️ Kanalni o'chirish",
  channel_detail: (title: string, id: string, link: string) =>
    `📢 Boshqarilmoqda: *${title}*\nID: \`${id}\`\nHavola: ${link}`,
  ask_new_channel_title: 'Iltimos, kanal uchun yangi sarlavha yuboring:',
  ask_new_channel_link:
    'Iltimos, kanal uchun yangi taklif havolasini yuboring:',
  channel_title_updated: '✅ Kanal sarlavhasi yangilandi.',
  channel_link_updated: '✅ Kanal havolasi yangilandi.',
  channel_deleted: "✅ Kanal o'chirildi.",

  // Admin - Movies
  manage_movies_title: '🎬 *Filmlarni boshqarish*\nAmalni tanlang:',
  add_movie_btn: "➕ Film qo'shish",
  manage_by_code_btn: "🔍 Kod bo'yicha boshqarish",
  ask_movie_code_manage: "Iltimos, boshqarmoqchi bo'lgan film kodini yuboring:",
  movie_not_found_admin: 'Film topilmadi.',
  manage_movie_detail: (title: string, code: number) =>
    `🎬 Boshqarilmoqda: *${title}* (Kod: ${code})`,
  ask_movie_file: 'Iltimos, film video faylini yuboring.',
  ask_movie_file_not_text: 'Iltimos, film video faylini yuboring (matn emas).',
  movie_saved: (title: string, code: number) =>
    `✅ Film saqlandi!\nSarlavha: ${title}\nKod: ${code}`,
  ask_new_movie_title: 'Iltimos, film uchun yangi sarlavha yuboring:',
  movie_title_updated: '✅ Film sarlavhasi yangilandi.',
  movie_deleted: "✅ Film o'chirildi.",
  no_movies: "Hozircha filmlar yo'q.",

  // Admin - Admins
  unauthorized: 'Ruxsat berilmagan.',
  manage_admins_title:
    "👑 *Adminlarni boshqarish*\nBoshqarish uchun adminni tanlang yoki yangisini qo'shing:",
  add_admin_btn: "➕ Yangi admin qo'shish",
  remove_access_btn: '🗑️ Ruxsatni olib tashlash',
  admin_detail: (name: string, username: string, id: string, role: string) =>
    `👤 *Admin ma'lumotlari*\n\nIsm: ${name}\nUsername: @${username}\nID: \`${id}\`\nRol: ${role}`,
  ask_promote_id:
    "Iltimos, admin qilmoqchi bo'lgan foydalanuvchining Telegram ID'sini yuboring.",
  invalid_id: "ID noto'g'ri.",
  user_not_found:
    "Foydalanuvchi ma'lumotlar bazasidan topilmadi. Ular avval botni ishga tushirishlari kerak.",
  user_promoted: (id: string) => `✅ Foydalanuvchi ${id} endi ADMIN.`,
  promote_error: 'Foydalanuvchini admin qilishda xatolik.',
  access_removed: 'Admin ruxsati olib tashlandi.',
  access_removed_for: (id: string) =>
    `✅ ${id} uchun admin ruxsati olib tashlandi.`,
  cannot_remove_superadmin: "Superadminni olib tashlab bo'lmaydi.",

  // Admin - Users
  generating_user_list: "Foydalanuvchilar ro'yxati yaratilmoqda...",

  // New Advanced Features
  categories_btn: '🎬 Janrlar',
  trending_btn: '🔥 Trending',
  request_movie_btn: "📥 Film so'rash",

  select_category: 'Marhamat, janrni tanlang:',
  trending_title: "🔥 *Eng ko'p ko'rilgan 10 ta film*:",

  rate_movie_prompt: 'Filmga baho bering:',
  rating_thanks: 'Bahoyingiz uchun rahmat!',
  average_rating: (rating: number) => `⭐️ Reyting: ${rating.toFixed(1)}`,

  ask_request_title: "Iltimos, so'ramoqchi bo'lgan filmingiz nomini yuboring:",
  request_received:
    "✅ So'rovingiz qabul qilindi! Film qo'shilganda sizga xabar beramiz.",

  admin_request_list: "📥 *Film so'rovlari*:",
  admin_request_item: (title: string, userTag: string) =>
    `🎬 *${title}*\nKimdan: ${userTag}`,

  no_categories: "Hozircha janrlar qo'shilmadi.",
  no_movies_in_category: "Bu janrda hozircha filmlar yo'q.",
  skip_category_btn: '➡️ O‘tkazib yuborish',
  ask_movie_category: 'Iltimos, film janrini tanlang:',
};
