export const avatarUrls = {
  user: "./assets/avatars/user.jpg",
};

export const fallbackCharacter = {
  id: "sakiko",
  name: "丰川祥子",
  initials: "祥",
  information: "",
  assets: {
    avatar: null,
    cover: null,
  },
};

export const state = {
  activeCharacter: fallbackCharacter,
  currentConversationId: null,
  conversations: [],
  chatMessages: [],
  isBusy: false,
  conversationPressTimer: null,
  conversationPressTarget: null,
  conversationPressTriggered: false,
  conversationPressStartX: 0,
  conversationPressStartY: 0,
  suppressNextConversationClickId: null,
  openConversationMenuId: null,
};
