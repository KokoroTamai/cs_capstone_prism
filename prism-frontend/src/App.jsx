import { useState, useEffect, useRef } from 'react';
import './App.css';
import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// 認証ヘッダー付き共通 fetch ユーティリティ
const authFetch = (url, options = {}, userId = null) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  return fetch(url, {
    ...options,
    headers,
  });
};

// 日付文字列（YYYY-MM-DD）を取得する
const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ストリーク情報を取得・更新する
const updateStreak = () => {
  const today = getTodayDateString();
  const lastStudyDate = localStorage.getItem('prism_last_study_date');
  let currentStreak = parseInt(localStorage.getItem('prism_streak_count') || '0', 10);

  if (!lastStudyDate) {
    currentStreak = 1;
    localStorage.setItem('prism_streak_count', currentStreak);
    localStorage.setItem('prism_last_study_date', today);
  } else if (lastStudyDate === today) {
    return currentStreak; // 今日すでに学習済みなら維持
  } else {
    const lastDate = new Date(lastStudyDate);
    const currentDate = new Date(today);
    const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentStreak += 1; // 昨日から連続
    } else {
      currentStreak = 1; // 途切れたので1日目からリセット
    }
    localStorage.setItem('prism_streak_count', currentStreak);
    localStorage.setItem('prism_last_study_date', today);
  }
  return currentStreak;
};

export default function App() {
  const isSeedingRef = useRef(false);

  // --- 認証状態 (Supabase Auth) ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // --- 画面切り替え & デッキ・フォルダ状態 ---
  const [view, setView] = useState('home'); // 'home' | 'study'
  const [decks, setDecks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);

  // --- 学習用カード状態 ---
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [facetStep, setFacetStep] = useState(0);
  const [shuffleKey, setShuffleKey] = useState(0);
  const isRandomFacetMode = false; // 必要に応じてトグル可能

  // --- メニュー・モーダル状態 ---
  const [activeMenuDeckId, setActiveMenuDeckId] = useState(null);
  const [activeMenuFolderId, setActiveMenuFolderId] = useState(null);

  const [isDeckCreateModalOpen, setIsDeckCreateModalOpen] = useState(false);
  const [isDeckEditModalOpen, setIsDeckEditModalOpen] = useState(false);
  const [isCardManageModalOpen, setIsCardManageModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isFolderEditModalOpen, setIsFolderEditModalOpen] = useState(false);

  // --- 編集・新規作成用 State ---
  const [editingDeck, setEditingDeck] = useState({ id: null, title: '', description: '', folderId: '' });
  const [editingFolder, setEditingFolder] = useState({ id: null, name: '' });
  const [managedCards, setManagedCards] = useState([]);
  const [editingCardId, setEditingCardId] = useState(null);
  const [editingFacets, setEditingFacets] = useState([]);

  // デッキ作成
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [newDeckFolder, setNewDeckFolder] = useState('');
  const [isCreatingNewFolderForCreate, setIsCreatingNewFolderForCreate] = useState(false);
  const [newFolderNameForCreate, setNewFolderNameForCreate] = useState('');

  // デッキ編集時
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // 新規カード作成
  const [newFacets, setNewFacets] = useState([
    { label: 'Theme 1', content: '' },
    { label: 'Theme 2', content: '' },
    { label: 'Theme 3', content: '' },
  ]);

  // Web Speech API 音声読み上げ
  const speakFacet = (facetOrText, deckLanguage = null) => {
    if (!('speechSynthesis' in window)) {
      alert('You browser does not support speech synthesis.');
      return;
    }

    window.speechSynthesis.cancel();

    let text = '';
    let label = '';

    if (typeof facetOrText === 'object' && facetOrText !== null) {
      text = facetOrText.content || '';
      label = (facetOrText.label || '').toLowerCase();
    } else {
      text = String(facetOrText || '');
    }

    if (!text.trim()) return;

    let lang = deckLanguage;
    if (!lang) {
      if (label.includes('english') || label.includes('meaning')) lang = 'en-US';
      else if (label.includes('spanish') || label.includes('español')) lang = 'es-ES';
      else if (label.includes('arabic') || label.includes('عربي')) lang = 'ar-SA';
      else if (label.includes('reading') || label.includes('kanji') || label.includes('japanese')) lang = 'ja-JP';
    }

    if (!lang) {
      if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) {
        lang = 'ar-SA';
      } else if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) {
        lang = 'ja-JP';
      } else if (/[áéíóúüñ¿¡]/i.test(text)) {
        lang = 'es-ES';
      } else {
        lang = 'en-US';
      }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = (lang === 'ja-JP' || lang === 'ar-SA') ? 0.9 : 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const getInitialFacetStep = (targetCard) => {
    if (!isRandomFacetMode) return 0;
    const count = targetCard?.facets?.length || 0;
    if (count <= 1) return 0;
    return Math.floor(Math.random() * count);
  };

  const [streakCount, setStreakCount] = useState(() => {
    return parseInt(localStorage.getItem('prism_streak_count') || '0', 10);
  });

  // ==========================================
  // 認証 & データ初回取得
  // ==========================================
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser && session) {
        const uid = currentUser.id;
        if (isSeedingRef.current) return;
        isSeedingRef.current = true;
        setAuthLoading(true);

        try {
          const [folderRes, deckRes] = await Promise.all([
            authFetch(`${API_BASE_URL}/api/folders`, {}, uid),
            authFetch(`${API_BASE_URL}/api/decks`, {}, uid),
          ]);

          let currentFolders = folderRes.ok ? await folderRes.json() : [];
          let currentDecks = deckRes.ok ? await deckRes.json() : [];

          const hasGenkiFolder = currentFolders.some((f) => f.name === 'GENKI Kanji');
          if (!hasGenkiFolder) {
            try {
              await authFetch(`${API_BASE_URL}/api/decks/seed`, { method: 'POST' }, uid);

              const [newFolderRes, newDeckRes] = await Promise.all([
                authFetch(`${API_BASE_URL}/api/folders`, {}, uid),
                authFetch(`${API_BASE_URL}/api/decks`, {}, uid),
              ]);
              if (newFolderRes.ok) currentFolders = await newFolderRes.json();
              if (newDeckRes.ok) currentDecks = await newDeckRes.json();
            } catch (seedErr) {
              console.error('Auto-seed failed:', seedErr);
            }
          }

          setFolders(currentFolders);
          setDecks(currentDecks);
        } catch (err) {
          console.error('Data fetch error:', err);
        } finally {
          setAuthLoading(false);
        }
      } else {
        setDecks([]);
        setFolders([]);
        setAuthLoading(false);
        isSeedingRef.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ドロップダウンメニュー外クリック検知
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuDeckId(null);
      setActiveMenuFolderId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // ログイン / 新規登録ハンドラ
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        alert('A registration confirmation email has been sent. Please check your inbox.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView('home');
    setSelectedDeck(null);
    setSelectedFolderId(null);
  };

  // カードシャッフル
  const handleShuffleCards = () => {
    if (!cards || cards.length <= 1) {
      alert('Cannot shuffle because there is one or fewer cards.');
      return;
    }
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCardIndex(0);
    setFacetStep(0);
    setShuffleKey((prev) => prev + 1);
  };

  // デッキ選択（学習画面へ）
  const handleSelectDeck = async (deck) => {
    setSelectedDeck(deck);
    setLoading(true);
    setView('study');

    try {
      const res = await authFetch(`${API_BASE_URL}/api/decks/${deck.id}/cards`, {}, user?.id);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(data);
      setCardIndex(0);
      setFacetStep(0);
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMenu = (e, deckId) => {
    e.stopPropagation();
    setActiveMenuDeckId((prev) => (prev === deckId ? null : deckId));
  };

  // --- デッキ操作 ---
  const handleCreateDeck = async (e) => {
    e.preventDefault();
    if (!newDeckTitle.trim() || !user?.id) return;

    try {
      let targetFolderId = newDeckFolder;

      if (isCreatingNewFolderForCreate) {
        if (!newFolderNameForCreate.trim()) {
          alert('Please enter a name for the new folder.');
          return;
        }

        const folderRes = await authFetch(
          `${API_BASE_URL}/api/folders`,
          {
            method: 'POST',
            body: JSON.stringify({ name: newFolderNameForCreate.trim() }),
          },
          user.id
        );

        if (!folderRes.ok) throw new Error('Failed to create the new folder.');
        const createdFolder = await folderRes.json();
        setFolders((prev) => [...prev, createdFolder]);
        targetFolderId = String(createdFolder.id);
      }

      const res = await authFetch(
        `${API_BASE_URL}/api/decks`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: newDeckTitle.trim(),
            description: newDeckDesc ? newDeckDesc.trim() : '',
            folder: targetFolderId ? String(targetFolderId) : '',
          }),
        },
        user.id
      );

      if (!res.ok) {
        const errorText = await res.text();
        alert(`Failed to create the deck: ${errorText}`);
        return;
      }

      const created = await res.json();
      setDecks((prev) => [created, ...prev]);

      setIsDeckCreateModalOpen(false);
      setNewDeckTitle('');
      setNewDeckDesc('');
      setNewDeckFolder('');
      setIsCreatingNewFolderForCreate(false);
      setNewFolderNameForCreate('');
    } catch (err) {
      console.error('Failed to create the deck:', err);
      alert('Failed to create the deck.');
    }
  };

  const openDeckEditModal = (e, deck) => {
    e.stopPropagation();
    setActiveMenuDeckId(null);
    const currentFolderId = deck.folderId ?? deck.folder;

    setEditingDeck({
      id: deck.id,
      title: deck.title,
      description: deck.description || '',
      folderId: currentFolderId ? String(currentFolderId) : '',
    });
    setIsCreatingNewFolder(false);
    setNewFolderName('');
    setIsDeckEditModalOpen(true);
  };

  const handleUpdateDeck = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      let targetFolderId = editingDeck.folderId;

      if (isCreatingNewFolder) {
        if (!newFolderName.trim()) {
          alert('Please enter a name for the new folder.');
          return;
        }

        const folderRes = await authFetch(
          `${API_BASE_URL}/api/folders`,
          {
            method: 'POST',
            body: JSON.stringify({ name: newFolderName.trim() }),
          },
          user.id
        );

        if (!folderRes.ok) throw new Error('Failed to create the new folder.');
        const createdFolder = await folderRes.json();
        setFolders((prev) => [...prev, createdFolder]);
        targetFolderId = String(createdFolder.id);
      }

      const res = await authFetch(
        `${API_BASE_URL}/api/decks/${editingDeck.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: editingDeck.title.trim(),
            description: editingDeck.description || '',
            folder: targetFolderId ? String(targetFolderId) : '',
          }),
        },
        user.id
      );

      if (!res.ok) throw new Error();
      const updated = await res.json();

      setDecks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setIsDeckEditModalOpen(false);
    } catch (error) {
      console.error('Failed to update the deck:', error);
      alert('Failed to update the deck');
    }
  };

  const handleDeleteDeck = async (e, deckId, deckTitle) => {
    e.stopPropagation();
    setActiveMenuDeckId(null);
    if (!user?.id) return;

    if (!window.confirm(`Do you want to delete "${deckTitle}" and all the cards inside it?`)) return;

    try {
      const res = await authFetch(`${API_BASE_URL}/api/decks/${deckId}`, { method: 'DELETE' }, user.id);
      if (!res.ok) throw new Error();
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
    } catch {
      alert('Failed to delete the deck');
    }
  };

  // --- カード一覧・管理モーダル ---
  const openCardManageModal = async (e, deck) => {
    e.stopPropagation();
    setActiveMenuDeckId(null);
    setSelectedDeck(deck);
    setEditingCardId(null);

    try {
      const res = await authFetch(`${API_BASE_URL}/api/decks/${deck.id}/cards`, {}, user?.id);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setManagedCards(data);
      setIsCardManageModalOpen(true);
    } catch {
      alert('Failed to fetch cards');
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Do you want to delete the card?')) return;

    try {
      const res = await authFetch(`${API_BASE_URL}/api/cards/${cardId}`, { method: 'DELETE' }, user?.id);
      if (!res.ok) throw new Error();
      setManagedCards((prev) => prev.filter((c) => c.id !== cardId));
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch {
      alert('Failed to delete the card.');
    }
  };

  const startEditCard = (card) => {
    setEditingCardId(card.id);
    setEditingFacets(card.facets.map((f) => ({ label: f.label, content: f.content })));
  };

  const handleUpdateCard = async (cardId) => {
    const validFacets = editingFacets.filter((f) => f.label.trim() && f.content.trim());
    if (validFacets.length < 3) {
      alert('At least 3 faces are required to create a prism.');
      return;
    }

    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/cards/${cardId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ facets: validFacets }),
        },
        user?.id
      );

      if (!res.ok) throw new Error();
      const updatedCard = await res.json();

      setManagedCards((prev) => prev.map((c) => (c.id === updatedCard.id ? updatedCard : c)));
      setCards((prev) => prev.map((c) => (c.id === updatedCard.id ? updatedCard : c)));
      setEditingCardId(null);
    } catch {
      alert('Failed to update the card');
    }
  };

  const handleCreateCard = async (e) => {
    e.preventDefault();
    const validFacets = newFacets.filter((f) => f.label.trim() && f.content.trim());
    if (validFacets.length < 3) {
      alert('At least 3 faces are required to create a prism.');
      return;
    }

    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/cards`,
        {
          method: 'POST',
          body: JSON.stringify({
            deckId: selectedDeck.id,
            facets: validFacets,
          }),
        },
        user?.id
      );

      if (!res.ok) throw new Error();
      const createdCard = await res.json();

      setCards((prev) => [...prev, createdCard]);
      setManagedCards((prev) => [...prev, createdCard]);
      setCardIndex(cards.length);
      setFacetStep(0);
      setIsCardModalOpen(false);
    } catch {
      alert('Failed to create the card');
    }
  };

  // --- プリズム計算 ---
  const currentCard = cards[cardIndex];
  const facets = currentCard?.facets || [];
  const totalFaces = facets.length;

  const cardWidth = 260;
  const radius = totalFaces >= 3 ? Math.round((cardWidth / 2) / Math.tan(Math.PI / totalFaces)) : 150;
  const stepAngle = totalFaces > 0 ? 360 / totalFaces : 0;
  const rotationAngle = -facetStep * stepAngle;

  const isFirstFacet = facetStep === 0;
  const isLastFacet = totalFaces > 0 && facetStep === totalFaces - 1;
  const isFirstCard = cardIndex === 0;
  const isLastCard = cards.length > 0 && cardIndex === cards.length - 1;

  const totalFacets = currentCard?.facets?.length || 4;
  const isCardComplete = facetStep >= totalFacets - 1;
  const buttonLabel = isCardComplete
    ? 'Next Card ▶'
    : `${currentCard?.facets?.[facetStep + 1]?.label || 'Next'} ▶`;

  const handleNextFacet = () => {
    // ★ カードを触ったのでストリークを更新
    const newStreak = updateStreak();
    setStreakCount(newStreak);

    const currentCard = cards[cardIndex];
    const totalFacets = currentCard?.facets?.length || 4;

    if (facetStep < totalFacets - 1) {
      setFacetStep((prev) => prev + 1);
    } else {
      if (cardIndex < cards.length - 1) {
        setCardIndex((prev) => prev + 1);
        setFacetStep(0);
      } else {
        setCardIndex(0);
        setFacetStep(0);
      }
    }
  };

  const handleUndoFacet = () => {
    if (!isFirstFacet) setFacetStep((prev) => prev - 1);
  };

  const handleReviewDecision = (status) => {
    authFetch(
      `${API_BASE_URL}/api/cards/${currentCard.id}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ status }),
      },
      user?.id
    ).catch(console.error);

    if (status === 'AGAIN') {
      setCards((prev) => [...prev, currentCard]);
    }

    if (!isLastCard || status === 'AGAIN') {
      setCardIndex((prev) => prev + 1);
      setFacetStep(0);
    } else {
      alert('You finished studying all the cards!🎉');
      setView('home');
    }
  };

  // --- フォルダー操作 ---
  const handleUpdateFolderName = async (e) => {
    e.preventDefault();
    if (!user?.id || !editingFolder.name.trim()) return;

    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/folders/${editingFolder.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name: editingFolder.name.trim() }),
        },
        user.id
      );

      if (!res.ok) throw new Error();
      const updated = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setIsFolderEditModalOpen(false);
    } catch (err) {
      console.error('Failed to update the folder name:', err);
      alert('Failed to update the folder name');
    }
  };

  const handleDeleteFolderAndDecks = async (folderId) => {
    if (!user?.id) return;
    if (!window.confirm('⚠️ Warning: The folder and all its decks and cards will be permanently deleted.\nAre you sure you want to delete it?')) return;

    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/folders/${folderId}?deleteDecks=true`,
        { method: 'DELETE' },
        user.id
      );

      if (!res.ok) throw new Error();

      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setDecks((prev) => prev.filter((d) => String(d.folderId) !== String(folderId)));
      setActiveMenuFolderId(null);
      if (selectedFolderId === folderId) setSelectedFolderId(null);
    } catch (err) {
      console.error('Failed to delete the folder and its decks:', err);
      alert('Failed to delete the folder and its decks');
    }
  };

  // ==========================================
  // 未ログイン時：ログイン / 新規登録画面
  // ==========================================
  if (authLoading) {
    return <div className="container"><h2>Loading...</h2></div>;
  }

  if (!user) {
    return (
      <div className="container">
        <div className="modal-backdrop" style={{ position: 'static', backgroundColor: 'transparent' }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>{isSignUp ? 'Create Prism Account' : 'Login to Prism'}</h2>
            </div>

            {authError && <div className="auth-error-banner">{authError}</div>}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="example@mail.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="save-btn" style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
                {isSignUp ? 'Sign Up' : 'Log In'}
              </button>
            </form>

            <button
              type="button"
              className="auth-toggle-btn"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError('');
              }}
            >
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 1. ホーム画面（デッキ一覧 & フォルダ表示）
  // ==========================================
  if (view === 'home') {
    const renderDeckCard = (deck) => (
      <div key={deck.id} className="deck-card" onClick={() => handleSelectDeck(deck)}>
        <div className="deck-card-header">
          <span className="deck-badge">{deck.folder ? `📁 ${deck.folder}` : 'Prism Deck'}</span>

          <div className="menu-container">
            <button
              className="kebab-menu-btn"
              onClick={(e) => toggleMenu(e, deck.id)}
              title="デッキメニュー"
            >
              ︙
            </button>

            {activeMenuDeckId === deck.id && (
              <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={(e) => openDeckEditModal(e, deck)}>
                  ✏️ Edit Deck Information
                </button>
                <button onClick={(e) => openCardManageModal(e, deck)}>
                  🗂 Manage Cards
                </button>
                <div className="dropdown-divider" />
                <button className="danger-btn" onClick={(e) => handleDeleteDeck(e, deck.id, deck.title)}>
                  🗑 Delete Deck
                </button>
              </div>
            )}
          </div>
        </div>

        <h2 className="deck-title">{deck.title}</h2>
        <p className="deck-desc">{deck.description || 'No description available'}</p>
        <div className="deck-action">Start learning ➔</div>
      </div>
    );

    return (
      <div className="home-container">
        <header className="home-header">
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span className="user-email-badge">👤 {user.email}</span>
            <button className="logout-btn" onClick={handleSignOut}>Log out</button>
          </div>

          <div className="brand">
            <img 
              src="/logo.png" 
              alt="Prism Logo" 
              style={{ 
                width: '50px', 
                height: '50px', 
                maxWidth: '50px', 
                maxHeight: '50px', 
                objectFit: 'contain',
                display: 'block'
              }} 
            />
            <h1>Prism Card</h1>
            {/* 🔥 ストリークバッジ */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1.5px solid #fed7aa',
                padding: '5px 12px',
                borderRadius: '20px',
                fontWeight: 'bold',
                color: '#c2410c',
                boxShadow: '0 2px 4px rgba(249, 115, 22, 0.08)',
                fontSize: '14px'
              }}
              title={`連続学習日数: ${streakCount}日`}
            >
              <span style={{ fontSize: '16px' }}>🔥</span>
              <span>{streakCount} {streakCount === 1 ? 'day' : 'days'}</span>
            </div>
          </div>

          <p className="subtitle">Language learning flashcards with polyhedral prisms</p>
          <button className="create-deck-btn" onClick={() => setIsDeckCreateModalOpen(true)}>
            ＋ Create New Deck
          </button>
        </header>

        {/* フォルダ開閉ナビゲーション */}
        {selectedFolderId && (
          <div style={{ margin: '16px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setSelectedFolderId(null)}
              style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: 'transparent', color: 'inherit' }}
            >
              ← Back to Folders
            </button>
            <h2 style={{ margin: 0 }}>
              📁 {folders.find((f) => String(f.id) === String(selectedFolderId))?.name}
            </h2>
          </div>
        )}

        {/* フォルダ一覧表示 */}
        {!selectedFolderId && folders.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '12px', color: '#888' }}>Folders</h3>
            <div className="deck-grid">
              {folders.map((folder) => {
                const count = decks.filter((d) => {
                  const fId = d.folderId ?? d.folder_id;
                  return fId && String(fId) === String(folder.id);
                }).length;

                return (
                  <div
                    key={folder.id}
                    className="deck-card"
                    onClick={() => setSelectedFolderId(folder.id)}
                    style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                  >
                    <div className="folder-header">
                      <div className="folder-title-area">
                        <span className="deck-badge">Folder</span>
                      </div>

                      <div className="menu-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="kebab-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuFolderId(activeMenuFolderId === folder.id ? null : folder.id);
                          }}
                        >
                          ⋮
                        </button>

                        {activeMenuFolderId === folder.id && (
                          <div className="dropdown-menu">
                            <button
                              onClick={() => {
                                setEditingFolder({ id: folder.id, name: folder.name });
                                setIsFolderEditModalOpen(true);
                                setActiveMenuFolderId(null);
                              }}
                            >
                              ✏️ Edit Name
                            </button>
                            <button
                              className="danger-btn"
                              onClick={() => handleDeleteFolderAndDecks(folder.id)}
                            >
                              🗑️ Delete Folder
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <h2 className="deck-title">📁 {folder.name}</h2>
                    <p className="deck-desc">{count} {count === 1 ? 'deck' : 'decks'}</p>
                    <div className="deck-action">Open Folder ➔</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* デッキ一覧表示 */}
        <div>
          {!selectedFolderId && folders.length > 0 && (
            <h3 style={{ marginBottom: '12px', color: '#888' }}>Uncategorized Decks</h3>
          )}

          <main className="deck-grid">
            {(() => {
              const currentDecks = selectedFolderId
                ? decks.filter((d) => {
                    const fId = d.folderId ?? d.folder_id;
                    return fId && String(fId) === String(selectedFolderId);
                  })
                : decks.filter((d) => !(d.folderId ?? d.folder_id));

              if (currentDecks.length === 0) {
                return (
                  <p style={{ color: '#888', gridColumn: '1 / -1' }}>
                    {selectedFolderId ? 'No decks in this folder.' : 'No uncategorized decks.'}
                  </p>
                );
              }

              return currentDecks.map(renderDeckCard);
            })()}
          </main>
        </div>

        {/* フォルダー名編集モーダル */}
        {isFolderEditModalOpen && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Edit Folder Name</h2>
                <button className="close-btn" onClick={() => setIsFolderEditModalOpen(false)}>×</button>
              </div>
              <form onSubmit={handleUpdateFolderName}>
                <div className="form-group">
                  <label>Folder Name</label>
                  <input
                    type="text"
                    value={editingFolder.name}
                    onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setIsFolderEditModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* デッキ新規作成モーダル */}
        {isDeckCreateModalOpen && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Create New Deck</h2>
                <button className="close-btn" onClick={() => setIsDeckCreateModalOpen(false)}>×</button>
              </div>
              <form onSubmit={handleCreateDeck}>
                <div className="form-group">
                  <label>Deck Name (Language or Theme)</label>
                  <input
                    type="text"
                    placeholder="Example: Korean (Basic Vocabulary), Spanish"
                    value={newDeckTitle}
                    onChange={(e) => setNewDeckTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Folder</label>
                  <select
                    className="form-select"
                    value={isCreatingNewFolderForCreate ? '__new__' : (newDeckFolder || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        setIsCreatingNewFolderForCreate(true);
                        setNewDeckFolder('');
                      } else {
                        setIsCreatingNewFolderForCreate(false);
                        setNewDeckFolder(val);
                      }
                    }}
                  >
                    <option value="">(None - No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={String(f.id)}>
                        📁 {f.name}
                      </option>
                    ))}
                    <option value="__new__">➕ Create New Folder...</option>
                  </select>

                  {isCreatingNewFolderForCreate && (
                    <input
                      type="text"
                      className="form-input new-folder-input"
                      placeholder="Enter new folder name"
                      value={newFolderNameForCreate}
                      onChange={(e) => setNewFolderNameForCreate(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    placeholder="Example: 4-sided prism with Kanji, reading, meaning, and examples"
                    value={newDeckDesc}
                    onChange={(e) => setNewDeckDesc(e.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setIsDeckCreateModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Create Deck</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* デッキ編集モーダル */}
        {isDeckEditModalOpen && (
          <div className="modal-backdrop">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Edit Deck Information</h2>
                <button className="close-btn" onClick={() => setIsDeckEditModalOpen(false)}>×</button>
              </div>
              <form onSubmit={handleUpdateDeck}>
                <div className="form-group">
                  <label>Deck Name</label>
                  <input
                    type="text"
                    value={editingDeck.title}
                    onChange={(e) => setEditingDeck({ ...editingDeck, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Folder</label>
                  <select
                    className="form-select"
                    value={isCreatingNewFolder ? '__new__' : (editingDeck.folderId || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        setIsCreatingNewFolder(true);
                        setEditingDeck((prev) => ({ ...prev, folderId: '' }));
                      } else {
                        setIsCreatingNewFolder(false);
                        setEditingDeck((prev) => ({ ...prev, folderId: val }));
                      }
                    }}
                  >
                    <option value="">(None - No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={String(f.id)}>
                        📁 {f.name}
                      </option>
                    ))}
                    <option value="__new__">➕ Create New Folder...</option>
                  </select>

                  {isCreatingNewFolder && (
                    <input
                      type="text"
                      className="form-input new-folder-input"
                      placeholder="Enter new folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={editingDeck.description || ''}
                    onChange={(e) => setEditingDeck({ ...editingDeck, description: e.target.value })}
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setIsDeckEditModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="save-btn">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* カード管理モーダル */}
        {isCardManageModalOpen && (
          <div className="modal-backdrop">
            <div className="modal-content large-modal">
              <div className="modal-header">
                <h2>Manage Cards in "{selectedDeck?.title}"</h2>
                <button className="close-btn" onClick={() => setIsCardManageModalOpen(false)}>×</button>
              </div>

              <div className="cards-manager-list">
                {managedCards.length === 0 ? (
                  <p className="no-data-msg">No cards available.</p>
                ) : (
                  managedCards.map((card, idx) => (
                    <div key={card.id} className="card-item-manage">
                      {editingCardId === card.id ? (
                        <div className="card-edit-box">
                          <h4>Edit Face #{idx + 1} of the Card</h4>
                          {editingFacets.map((f, fIdx) => (
                            <div key={fIdx} className="form-facet-row">
                              <input
                                type="text"
                                className="input-label"
                                value={f.label}
                                onChange={(e) => {
                                  const updated = [...editingFacets];
                                  updated[fIdx].label = e.target.value;
                                  setEditingFacets(updated);
                                }}
                              />
                              <input
                                type="text"
                                className="input-content"
                                value={f.content}
                                onChange={(e) => {
                                  const updated = [...editingFacets];
                                  updated[fIdx].content = e.target.value;
                                  setEditingFacets(updated);
                                }}
                              />
                            </div>
                          ))}
                          <div className="edit-btn-group">
                            <button className="cancel-btn" onClick={() => setEditingCardId(null)}>
                              Cancel
                            </button>
                            <button className="save-btn" onClick={() => handleUpdateCard(card.id)}>
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="card-item-content">
                          <div className="card-summary">
                            <span className="card-idx-badge">#{idx + 1}</span>
                            <strong className="card-main-title">
                              {card.facets[0]?.content || 'No Content'}
                            </strong>
                            <span className="card-facets-count">
                              ({card.facets.length} Faces: {card.facets.map((f) => f.label).join(' / ')})
                            </span>
                          </div>
                          <div className="card-action-btns">
                            <button className="card-edit-btn" onClick={() => startEditCard(card)}>
                              Edit
                            </button>
                            <button className="card-del-btn" onClick={() => handleDeleteCard(card.id)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="save-btn"
                  onClick={() => {
                    setIsCardManageModalOpen(false);
                    setIsCardModalOpen(true);
                  }}
                >
                  ＋ Add Card to This Set
                </button>
                <button type="button" className="cancel-btn" onClick={() => setIsCardManageModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 2. 学習画面（3Dプリズム）
  // ==========================================
  return (
    <div className="container">
      <header className="header-info">
        <div className="header-top">
          <button className="back-home-btn" onClick={() => setView('home')}>
            ◀ Back to Decks
          </button>
          <h2>{selectedDeck?.title}</h2>
          <button className="add-card-btn" onClick={() => setIsCardModalOpen(true)}>
            ＋ Create Card
          </button>
        </div>

        {cards.length > 0 && (
          <div className="card-nav">
            <button
              className="card-nav-button"
              onClick={() => {
                if (!isFirstCard) {
                  // ★ 構文エラーを修正 (cardIndex - 1)
                  const nextIndex = cardIndex - 1;
                  setCardIndex(nextIndex);
                  setFacetStep(getInitialFacetStep(cards[nextIndex]));
                }
              }}
              disabled={isFirstCard}
            >
              ◀
            </button>

            <span className="card-counter">
              Card {cardIndex + 1} / {cards.length}
            </span>

            <button
              className="card-nav-button"
              onClick={() => {
                if (!isLastCard) {
                  const nextIndex = cardIndex + 1;
                  setCardIndex(nextIndex);
                  setFacetStep(getInitialFacetStep(cards[nextIndex]));
                }
              }}
              disabled={isLastCard}
            >
              ▶
            </button>

            <button
              className="shuffle-btn"
              onClick={() => {
                handleShuffleCards();
                setFacetStep(getInitialFacetStep(cards[0]));
              }}
              title="Shuffle the cards in this deck"
            >
              🔀 Shuffle decks
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <h2>Loading...</h2>
      ) : cards.length === 0 ? (
        <div className="empty-deck-notice">
          <p>No cards available in this deck.</p>
          <button className="save-btn" onClick={() => setIsCardModalOpen(true)}>
            Create the first card
          </button>
        </div>
      ) : (
        <>
          {/* 3Dプリズム表示部 */}
          <div className="scene" key={`scene-${shuffleKey}-${currentCard?.id}`}>
            <div
              className="prism"
              style={{
                transform: `translateZ(-${radius}px) rotateY(${rotationAngle}deg)`,
              }}
            >
              {facets.map((facet, index) => {
                // ★ 構文エラーを修正 (index * stepAngle)
                const faceAngle = index * stepAngle;
                const isFront = index === facetStep;

                return (
                  <div
                    key={`${facet.id || index}-${shuffleKey}`}
                    className={`prism-face ${isFront ? 'active' : 'hidden-face'}`}
                    style={{
                      width: `${cardWidth}px`,
                      transform: `rotateY(${faceAngle}deg) translateZ(${radius}px)`,
                    }}
                  >
                    <div className="face-inner">
                      <span className="face-label">{facet.label}</span>
                      <div className="face-content">{facet.content}</div>
                      <span className="face-index">
                        Face {index + 1} / {totalFaces}
                      </span>
                    </div>

                    {!isFront && (
                      <div className="face-placeholder">
                        <span>?</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="controls">
            <button
              className="undo-button"
              onClick={handleUndoFacet}
              disabled={isFirstFacet}
              title="前の面へ戻る"
            >
              ↺
            </button>

            {/* 音声読み上げボタン */}
            <button
              type="button"
              className="speak-btn"
              onClick={() => {
                const activeFacet = currentCard?.facets?.[facetStep];
                if (activeFacet) speakFacet(activeFacet);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #bab0c0',
                background: '#f5f2f8',
                cursor: 'pointer',
                fontSize: '16px',
              }}
              title="現在の面を発音"
            >
              🔊
            </button>

            {!isLastFacet ? (
              <button
                type="button"
                className="next-facet-btn"
                onClick={handleNextFacet}
                style={{
                  backgroundColor: '#581c87',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(88, 28, 135, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                {buttonLabel}
              </button>
            ) : (
              <div className="decision-buttons">
                <button
                  className="btn-again"
                  onClick={() => handleReviewDecision('AGAIN')}
                >
                  Try Again 🔁
                </button>
                <button
                  className="btn-mastered"
                  onClick={() => handleReviewDecision('MASTERED')}
                >
                  Memorized ✅
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 新規カード作成モーダル */}
      {isCardModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add Card to "{selectedDeck?.title}"</h2>
              <button className="close-btn" onClick={() => setIsCardModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateCard}>
              <div className="facets-form-list">
                {newFacets.map((f, i) => (
                  <div key={i} className="form-facet-row">
                    <span className="facet-num">{i + 1}</span>
                    <input
                      type="text"
                      placeholder="Face Type"
                      value={f.label}
                      onChange={(e) => {
                        const updated = [...newFacets];
                        updated[i].label = e.target.value;
                        setNewFacets(updated);
                      }}
                      className="input-label"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Content"
                      value={f.content}
                      onChange={(e) => {
                        const updated = [...newFacets];
                        updated[i].content = e.target.value;
                        setNewFacets(updated);
                      }}
                      className="input-content"
                      required
                    />
                    {newFacets.length > 3 && (
                      <button
                        type="button"
                        className="del-facet-btn"
                        onClick={() => setNewFacets((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="add-facet-row-btn"
                onClick={() => setNewFacets((prev) => [...prev, { label: '', content: '' }])}
              >
                ＋ Add Face
              </button>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setIsCardModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  Register and Create Prism
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}