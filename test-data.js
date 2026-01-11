// 运行此脚本来添加测试数据到 localStorage
const testWords = [
    {
        id: "word-1",
        text: "abandon",
        groupTitle: "SAT词汇",
        addedAt: 1704873600000,
        lastReviewed: null,
        nextReview: 1705046400000,
        streak: 0,
        easeFactor: 2.5,
        interval: 0,
        totalAttempts: 2,
        totalWrong: 2,
        lastWrongAt: 1704960000000
    },
    {
        id: "word-2",
        text: "ability",
        groupTitle: "SAT词汇",
        addedAt: 1704873600000,
        lastReviewed: null,
        nextReview: 1705046400000,
        streak: 0,
        easeFactor: 2.5,
        interval: 0,
        totalAttempts: 3,
        totalWrong: 1,
        lastWrongAt: 1704873600000
    },
    {
        id: "word-3",
        text: "accelerate",
        groupTitle: "SAT词汇",
        addedAt: 1704960000000,
        lastReviewed: null,
        nextReview: 1705046400000,
        streak: 0,
        easeFactor: 2.5,
        interval: 0,
        totalAttempts: 1,
        totalWrong: 3,
        lastWrongAt: 1704873600000
    },
    {
        id: "word-4",
        text: "accommodate",
        groupTitle: "日常单词",
        addedAt: 1704960000000,
        lastReviewed: null,
        nextReview: 1735689600000,
        streak: 0,
        easeFactor: 2.5,
        interval: 0,
        totalAttempts: 0,
        totalWrong: 0,
        lastWrongAt: null
    }
];

// 添加到 localStorage
localStorage.setItem('dictation-words', JSON.stringify(testWords));
console.log('✅ 测试数据已添加到 localStorage');
console.log('现在刷新页面查看效果');
