export default defineNuxtPlugin({
  name: 'post-logging',
  enforce: 'post',
  setup() {
    const nuxtApp = useNuxtApp()
    console.log('Post logging plugin initialized')
    
    // Simple direct API call to log posts
    function logPost(post: any) {
      // For debugging - shows what we're actually logging
      console.log('Attempting to log post:', {
        id: post.id,
        authorId: post.account?.id,
        content: post.content?.substring(0, 100) + '...'
      })
      
      // Extract post data
      const postData = {
        post_id: post.id,
        author_id: post.account?.id || 'unknown',
        author_name: post.account?.username || '',
        content: post.content || '',
        content_type: post.contentType || 'text',
        created_at: post.createdAt || new Date().toISOString(),
        interaction_counts: {
          favorites: post.favouritesCount || 0,
          reblogs: post.reblogsCount || 0,
          replies: post.repliesCount || 0
        }
      }
      
      // Don't log test posts repeatedly
      if (postData.post_id.startsWith('test-post-') && 
          localStorage.getItem('already_logged_test')) {
        console.log('Skipping test post, already logged one before')
        return
      }
      
      if (postData.post_id.startsWith('test-post-')) {
        localStorage.setItem('already_logged_test', 'true')
      }
      
      // Log post to server - with retry mechanism
      const sendRequest = (retries = 3) => {
        fetch('http://localhost:5002/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postData)
        })
        .then(response => {
          if (response.ok) {
            console.log('✅ Successfully logged post:', post.id)
            return response.json()
          }
          throw new Error(`Failed to log post: ${response.status}`)
        })
        .then(data => {
          // Success! No need to log the response
        })
        .catch(error => {
          console.error('❌ Error logging post:', error)
          // Retry if we have retries left
          if (retries > 0) {
            console.log(`Retrying... (${retries} attempts left)`)
            setTimeout(() => sendRequest(retries - 1), 1000)
          }
        })
      }
      
      // FINAL SAFETY CHECK: Fix any duplicate digits in the interaction counts
      // This handles the case where "88" is being sent as "8888"
      if (postData.interaction_counts) {
        const fixCount = (num) => {
          if (!num) return num
          const str = String(num)
          // Check if the number has an even number of digits and might be duplicated
          if (str.length >= 4 && str.length % 2 === 0) {
            const half = str.length / 2
            const firstHalf = str.substring(0, half)
            const secondHalf = str.substring(half)
            // If both halves are identical, just use first half
            if (firstHalf === secondHalf) {
              return parseInt(firstHalf)
            }
          }
          return num
        }
        
        postData.interaction_counts.favorites = fixCount(postData.interaction_counts.favorites)
        postData.interaction_counts.reblogs = fixCount(postData.interaction_counts.reblogs)
        postData.interaction_counts.replies = fixCount(postData.interaction_counts.replies)
        
        console.log('FIXED POST DATA:', JSON.stringify(postData.interaction_counts))
      }
      
      // Start the request
      sendRequest()
    }
    
    // Hook into various Nuxt events that might contain timeline items
    // Try several hooks to find which one contains our timeline data
    nuxtApp.hook('timeline:items', (items) => {
      console.log('Timeline items detected:', items?.length || 0)
      if (Array.isArray(items) && items.length > 0) {
        items.forEach(item => {
          if (item && item.id) {
            logPost(item)
          }
        })
      }
    })
    
    // Try additional events
    const eventsToTry = [
      'page:start', 
      'page:finish', 
      'app:mounted',
      'vue:setup'
    ]
    
    eventsToTry.forEach(event => {
      nuxtApp.hook(event, (...args) => {
        console.log(`Event "${event}" triggered, searching for timeline data`)
        
        // After event fires, scan for posts
        setTimeout(() => {
          // Try to find timeline items in the DOM
          const posts = document.querySelectorAll('.status, .timeline-item, article')
          if (posts.length > 0) {
            console.log(`Found ${posts.length} potential posts in the DOM after ${event}`)
          }
        }, 1000)
      })
    })
    
    // Alternative approach - watch the DOM for status cards
    if (process.client) {
      setTimeout(() => {
        // First do a direct scan of the DOM to catch existing posts
        console.log('Scanning DOM for existing posts and analyzing structure...')
        
        // Log DOM structure helper function
        function analyzePostElement(el: Element, depth = 0) {
          // Maximum depth to avoid infinite recursion
          if (depth > 5) return
          
          // Create indentation based on depth
          const indent = '  '.repeat(depth)
          
          // Log element details
          const classList = Array.from(el.classList || []).join('.')
          const id = el.id ? `#${el.id}` : ''
          const tag = el.tagName.toLowerCase()
          const attrs = Array.from(el.attributes)
            .filter(attr => !attr.name.startsWith('data-v-') && attr.name !== 'class' && attr.name !== 'id')
            .map(attr => `[${attr.name}="${attr.value}"]`)
            .join('')
          
          console.log(`${indent}${tag}${id}${classList ? `.${classList}` : ''}${attrs}`)
          
          // Look for interesting data
          if (el.getAttribute('data-id') || 
              el.getAttribute('data-status-id') || 
              classList.includes('status') || 
              classList.includes('timeline-item')) {
            console.log(`${indent}*** INTERESTING POST ELEMENT FOUND ***`)
            
            // Get all attributes
            const allAttrs = Array.from(el.attributes)
              .map(attr => `${attr.name}="${attr.value}"`)
              .join(', ')
            console.log(`${indent}All attributes: ${allAttrs}`)
            
            // Get the HTML content
            const contentSample = el.innerHTML.substring(0, 200) + (el.innerHTML.length > 200 ? '...' : '')
            console.log(`${indent}Content sample: ${contentSample}`)
          }
          
          // Recursively analyze children
          Array.from(el.children).forEach(child => {
            analyzePostElement(child, depth + 1)
          })
        }
        
        // First let's try to find the timeline container
        const possibleTimelineContainers = [
          document.querySelector('main'),
          document.querySelector('.timeline-content'),
          document.querySelector('.timeline'),
          document.querySelector('[role="feed"]'),
          document.querySelector('[data-testid="timeline"]')
        ].filter(Boolean)
        
        console.log(`Found ${possibleTimelineContainers.length} possible timeline containers`)
        
        // Analyze each potential container
        possibleTimelineContainers.forEach((container, index) => {
          console.log(`Analyzing timeline container ${index + 1}:`)
          if (container) {
            // Log the container's structure
            console.log('Container element:', container)
            
            // Find all direct children that might be posts
            const directChildren = Array.from(container.children)
            console.log(`Container has ${directChildren.length} direct children`)
            
            // Check first few children
            directChildren.slice(0, 3).forEach((child, childIndex) => {
              console.log(`Analyzing child ${childIndex + 1}:`)
              analyzePostElement(child)
            })
          }
        })
        
        // Try various selectors that might match posts
        const selectors = [
          'article', 
          '.status', 
          '.timeline-item', 
          '[data-id]',
          '[data-status-id]',
          '.status-card',
          '.post',
          '.tweet',
          'div[role="article"]'
        ]
        
        console.log('Trying specific selectors to find posts...')
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector)
          console.log(`Found ${elements.length} elements matching "${selector}"`)
          
          if (elements.length > 0) {
            // Sample the first element
            const sample = elements[0]
            console.log(`Sample element (${selector}):`, sample)
            
            // Check for useful properties
            const hasId = sample.id ? `id="${sample.id}"` : "no id"
            const hasDataId = sample.getAttribute('data-id') ? `data-id="${sample.getAttribute('data-id')}"` : "no data-id"
            const hasDataStatusId = sample.getAttribute('data-status-id') ? `data-status-id="${sample.getAttribute('data-status-id')}"` : "no data-status-id"
            
            console.log(`Properties: ${hasId}, ${hasDataId}, ${hasDataStatusId}`)
            
            // Get text content sample
            const textSample = sample.textContent?.substring(0, 100).trim() + (sample.textContent && sample.textContent.length > 100 ? '...' : '')
            console.log(`Text sample: ${textSample}`)
            
            // Try to find author info
            const authorElement = sample.querySelector('.author') || 
                                 sample.querySelector('[data-author-id]') || 
                                 sample.querySelector('.account') ||
                                 sample.querySelector('a[href*="/accounts/"]')
            
            if (authorElement) {
              console.log('Found author element:', authorElement)
              console.log('Author attributes:', Array.from(authorElement.attributes)
                .map(attr => `${attr.name}="${attr.value}"`)
                .join(', '))
            }
            
            // Try to find content
            const contentElement = sample.querySelector('.content') || 
                                   sample.querySelector('.status-content') || 
                                   sample.querySelector('p')
            
            if (contentElement) {
              console.log('Found content element:', contentElement)
              console.log('Content HTML:', contentElement.innerHTML.substring(0, 150) + '...')
            }
          }
        })
        
        // Logging a single test post to verify database connection
        const testPost = {
          id: 'test-post-' + Date.now(),
          account: { id: 'test-user' },
          content: '<p>Test post to verify database connection</p>',
          createdAt: new Date().toISOString(),
          favouritesCount: 5,
          reblogsCount: 2,
          repliesCount: 3
        }
        
        console.log('Logging test post to verify database connection...')
        logPost(testPost)
        
        // Add a "debug action" button to trigger DOM analysis on demand
        const debugButton = document.createElement('button')
        debugButton.textContent = 'Debug Timeline Structure'
        debugButton.style.position = 'fixed'
        debugButton.style.bottom = '20px'
        debugButton.style.right = '20px'
        debugButton.style.zIndex = '9999'
        debugButton.style.padding = '10px'
        debugButton.style.backgroundColor = '#007bff'
        debugButton.style.color = 'white'
        debugButton.style.border = 'none'
        debugButton.style.borderRadius = '5px'
        debugButton.style.cursor = 'pointer'
        
        debugButton.addEventListener('click', () => {
          console.clear()
          console.log('===== MANUAL TIMELINE STRUCTURE ANALYSIS =====')
          console.log('Current URL:', window.location.href)
          
          // Find timeline-related elements
          const timeline = document.querySelector('.timeline') || 
                          document.querySelector('main') || 
                          document.querySelector('[role="feed"]')
          
          console.log('Timeline container:', timeline)
          
          // Find post elements
          const articles = document.querySelectorAll('article')
          console.log(`Found ${articles.length} article elements`)
          
          if (articles.length > 0) {
            // Analyze the first 3 articles in detail
            Array.from(articles).slice(0, 3).forEach((article, i) => {
              console.log(`\n===== ARTICLE ${i+1} ANALYSIS =====`)
              console.log('Article element:', article)
              
              // Get all data attributes
              const dataAttrs = {}
              Array.from(article.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .forEach(attr => {
                  dataAttrs[attr.name] = attr.value
                })
              console.log('Data attributes:', dataAttrs)
              
              // Get article ID
              const articleId = article.id || article.getAttribute('data-id') || 
                              article.getAttribute('data-status-id') || 
                              'unknown'
              console.log('Article ID:', articleId)
              
              // Try to identify the author
              const authorElement = article.querySelector('.author') || 
                                  article.querySelector('.status-author') ||
                                  article.querySelector('.account') ||
                                  article.querySelector('a[href*="/accounts/"]')
              console.log('Author element:', authorElement)
              
              // Try to get actual content
              const contentElement = article.querySelector('.status-content') || 
                                   article.querySelector('.content') ||
                                   article.querySelector('p')
              if (contentElement) {
                console.log('Content element:', contentElement)
                console.log('Content text:', contentElement.textContent?.substring(0, 200))
              } else {
                console.log('No content element found')
              }
              
              // Try to extract post metadata from Vue component
              console.log('Attempting to extract Vue component data...')
              try {
                // Look for the Vue instance - not always accessible
                // @ts-ignore
                const vueInstance = article.__vue__ || article.__vue_app__ || article.__vueParentComponent__
                if (vueInstance) {
                  console.log('Found Vue instance:', vueInstance)
                }
              } catch (e) {
                console.log('Could not access Vue instance:', e)
              }
              
              // Simple DOM tree view
              console.log('\nSimplified DOM structure:')
              analyzePostElement(article, 0)
            })
          }
          
          // Look for timeline items that aren't articles
          const nonArticlePosts = document.querySelectorAll('.timeline-item:not(article), .status:not(article)')
          console.log(`\nFound ${nonArticlePosts.length} timeline items that aren't articles`)
          
          if (nonArticlePosts.length > 0) {
            Array.from(nonArticlePosts).slice(0, 2).forEach((item, i) => {
              console.log(`\n===== NON-ARTICLE ITEM ${i+1} =====`)
              console.log(item)
              analyzePostElement(item, 0)
            })
          }
          
          // Try to figure out the virtual scroller
          const virtualScroller = document.querySelector('.vue-recycle-scroller') || 
                                document.querySelector('.scroller') ||
                                document.querySelector('.virtual-scroller')
          if (virtualScroller) {
            console.log('\n===== VIRTUAL SCROLLER DETECTED =====')
            console.log(virtualScroller)
          }
        })
        
        document.body.appendChild(debugButton)
        
        // Set up mutation observer to catch new posts
        const observer = new MutationObserver((mutations) => {
          console.log('DOM mutation detected, checking for new posts...')
          
          // Check if timeline exists on mutation
          const timeline = document.querySelector('.timeline') || 
                          document.querySelector('main') || 
                          document.querySelector('[role="feed"]')
                          
          if (!timeline) {
            console.log('No timeline found after mutation')
            return
          }
          
          // Find articles that we haven't logged yet
          const articles = document.querySelectorAll('article:not([data-logged="true"])')
          if (articles.length > 0) {
            console.log(`Found ${articles.length} new articles to log`)
            
            articles.forEach(article => {
              // Mark as logged to avoid duplicates
              article.setAttribute('data-logged', 'true')
              
              try {
                // Find the status-id from the div with id starting with "status-"
                let statusId = 'unknown-' + Date.now()
                
                // First look for child div with status ID
                const statusDiv = article.querySelector('div[id^="status-"]')
                if (statusDiv) {
                  statusId = statusDiv.id.replace('status-', '')
                } else {
                  // Try other ways to find ID
                  statusId = article.getAttribute('data-status-id') || 
                             article.getAttribute('data-id') || 
                             article.id ||
                             'unknown-' + Date.now()
                }
                
                // Try to find author ID - in Elk it's more complex to get
                let authorId = 'unknown'
                // First try account link which might have the ID embedded
                const accountLink = article.querySelector('a[href*="/accounts/"]')
                if (accountLink) {
                  const href = accountLink.getAttribute('href')
                  const matches = href?.match(/\/accounts\/([^/]+)/)
                  if (matches && matches[1]) {
                    authorId = matches[1]
                  }
                }
                
                // Try older approaches too
                if (authorId === 'unknown') {
                  const authorElement = article.querySelector('.status-author') || 
                                      article.querySelector('.author') ||
                                      article.querySelector('.display-name')
                  if (authorElement) {
                    authorId = authorElement.getAttribute('data-author-id') || 
                              authorElement.getAttribute('href')?.split('/').pop() || 
                              'unknown'
                  }
                }
                
                // Get content element - look for the status-body first which is most reliable
                const statusBody = article.querySelector('.status-body')
                const contentElement = statusBody || 
                                     article.querySelector('.status-content') || 
                                     article.querySelector('.content') || 
                                     article.querySelector('p')
                
                // Try to get author name
                let authorName = 'unknown'
                const displayNameElement = article.querySelector('.display-name') ||
                                         article.querySelector('.account-name')
                if (displayNameElement) {
                  authorName = displayNameElement.textContent?.trim() || 'unknown'
                }
                
                // Try to extract interaction counts
                let favouritesCount = 0
                let reblogsCount = 0
                let repliesCount = 0
                
                // Try multiple different selector patterns to find interaction counts
                // Approach 1: Find interaction counts from counters in action buttons
                const counterElements = article.querySelectorAll('.status-actions button .counter, .action-counter, .interaction-count')
                if (counterElements.length > 0) {
                  console.log(`Found ${counterElements.length} counter elements`)
                  counterElements.forEach(counter => {
                    const button = counter.closest('button')
                    if (!button) return
                    
                    const buttonHTML = button.innerHTML
                    const countText = counter.textContent?.trim() || '0'
                    const count = parseInt(countText) || 0
                    
                    console.log(`Counter element: ${buttonHTML.substring(0, 50)}... with count: ${countText}`)
                    
                    if (buttonHTML.includes('i-ri:chat') || buttonHTML.includes('comment') || buttonHTML.includes('reply')) {
                      repliesCount = count
                    } else if (buttonHTML.includes('i-ri:repeat') || buttonHTML.includes('boost') || buttonHTML.includes('reblog')) {
                      reblogsCount = count
                    } else if (buttonHTML.includes('i-ri:heart') || buttonHTML.includes('star') || buttonHTML.includes('favorite') || buttonHTML.includes('like')) {
                      favouritesCount = count
                    }
                  })
                }
                
                // Approach 2: Look for any action toolbar and process all buttons
                const actionToolbar = article.querySelector('.status-actions, .post-actions, .action-bar, .toolbar')
                if (actionToolbar && (favouritesCount === 0 || reblogsCount === 0 || repliesCount === 0)) {
                  console.log('Found action toolbar, checking buttons...')
                  const buttons = actionToolbar.querySelectorAll('button')
                  buttons.forEach(button => {
                    // Check for counter content inside button
                    const buttonHTML = button.innerHTML
                    const buttonText = button.textContent?.trim() || ''
                    const countMatch = buttonText.match(/(\d+)/)
                    const count = countMatch ? parseInt(countMatch[1]) : 0
                    
                    console.log(`Action button: ${buttonHTML.substring(0, 50)}... with text: ${buttonText}`)
                    
                    if (buttonHTML.includes('comment') || buttonHTML.includes('reply') || 
                        button.getAttribute('aria-label')?.toLowerCase().includes('reply')) {
                      repliesCount = count
                    } else if (buttonHTML.includes('boost') || buttonHTML.includes('reblog') || 
                              button.getAttribute('aria-label')?.toLowerCase().includes('boost')) {
                      reblogsCount = count
                    } else if (buttonHTML.includes('favorite') || buttonHTML.includes('like') || 
                              button.getAttribute('aria-label')?.toLowerCase().includes('favorite')) {
                      favouritesCount = count
                    }
                  })
                }
                
                // Approach 3: Look specifically for interaction buttons and clean count extraction
                const actionTypes = [
                  {type: 'favorite', keywords: ['favorite', 'like', 'heart'], countVar: 'favouritesCount'},
                  {type: 'reblog', keywords: ['reblog', 'boost', 'repeat'], countVar: 'reblogsCount'},
                  {type: 'reply', keywords: ['reply', 'comment', 'chat'], countVar: 'repliesCount'}
                ]
                
                actionTypes.forEach(action => {
                  // Skip if we already found a count for this action
                  const currentCount = action.type === 'favorite' ? favouritesCount : 
                                      action.type === 'reblog' ? reblogsCount : repliesCount
                  if (currentCount > 0) return
                  
                  // Find elements that might contain the count
                  let foundElements = []
                  action.keywords.forEach(keyword => {
                    // Look for elements with the keyword in various attributes
                    const elements = Array.from(article.querySelectorAll(`*[class*="${keyword}"], *[aria-label*="${keyword}"], button`))
                    elements.forEach(el => {
                      if (el.textContent && 
                         (el.textContent.includes(keyword) || 
                          el.innerHTML.toLowerCase().includes(keyword) || 
                          el.getAttribute('aria-label')?.toLowerCase().includes(keyword))) {
                        foundElements.push(el)
                      }
                    })
                  })
                  
                  // Sort elements by how likely they are to contain the actual count (smaller elements first)
                  foundElements.sort((a, b) => a.textContent.length - b.textContent.length)
                  
                  // Try to extract the count from each element
                  for (const el of foundElements) {
                    // Get the element's text content without child element text
                    let textContent = ''
                    for (const node of el.childNodes) {
                      if (node.nodeType === Node.TEXT_NODE) {
                        textContent += node.textContent
                      }
                    }
                    if (!textContent) textContent = el.textContent || ''
                    
                    // Clean the text content and extract the number
                    // Try to handle numbers as actual separate numbers, not parts of text
                    const trimmedText = textContent.trim()
                    
                    // Try exact number extraction with space/boundary before/after
                    const exactMatch = trimmedText.match(/\s(\d+)\s/) || 
                                     trimmedText.match(/^(\d+)\s/) || 
                                     trimmedText.match(/\s(\d+)$/) ||
                                     trimmedText.match(/^(\d+)$/)
                    
                    if (exactMatch) {
                      const count = parseInt(exactMatch[1])
                      console.log(`Found ${action.type} count: ${count} in element:`, el.outerHTML.substring(0, 100))
                      
                      // Set the appropriate counter
                      if (action.type === 'favorite') favouritesCount = count
                      else if (action.type === 'reblog') reblogsCount = count
                      else if (action.type === 'reply') repliesCount = count
                      
                      // Stop searching for this action type
                      break
                    }
                    
                    // If no exact match, try another approach - look for single-digit numbers (1-2 chars long)
                    // This is a fallback for buttons that might just have number with no spacing
                    if (trimmedText.length <= 2 && /^\d+$/.test(trimmedText)) {
                      const count = parseInt(trimmedText)
                      console.log(`Found ${action.type} count (simple): ${count} in element:`, el.outerHTML.substring(0, 100))
                      
                      // Set the appropriate counter
                      if (action.type === 'favorite') favouritesCount = count
                      else if (action.type === 'reblog') reblogsCount = count
                      else if (action.type === 'reply') repliesCount = count
                      
                      // Stop searching for this action type
                      break
                    }
                  }
                })
                
                // Log what we found for debugging
                console.log(`Extracted interaction counts - favorites: ${favouritesCount}, reblogs: ${reblogsCount}, replies: ${repliesCount}`)
                
                // CRITICAL FIX: Check for duplicate digits which is the most common issue
                // If a number like 88 is being sent as 8888, the digits are being duplicated
                const fixDuplicateDigits = (num) => {
                  const str = String(num)
                  // Check if the number has an even number of digits and might be duplicated
                  if (str.length >= 4 && str.length % 2 === 0) {
                    const half = str.length / 2
                    const firstHalf = str.substring(0, half)
                    const secondHalf = str.substring(half)
                    // If both halves are identical, just use first half
                    if (firstHalf === secondHalf) {
                      return parseInt(firstHalf)
                    }
                  }
                  return num
                }
                
                // Apply the duplicate digit fix to all counts
                favouritesCount = fixDuplicateDigits(favouritesCount)
                reblogsCount = fixDuplicateDigits(reblogsCount)
                repliesCount = fixDuplicateDigits(repliesCount)
                
                console.log(`FIXED counts - favorites: ${favouritesCount}, reblogs: ${reblogsCount}, replies: ${repliesCount}`)
                
                // Find content type
                let contentType = 'text'
                if (article.querySelector('img:not(.emoji)') || article.querySelector('.media-container')) {
                  contentType = 'image'
                }
                if (article.querySelector('video') || article.querySelector('.video-container')) {
                  contentType = 'video'
                }
                if (article.querySelector('audio')) {
                  contentType = 'audio'
                }
                if (article.querySelector('.poll')) {
                  contentType = 'poll'
                }
                if (article.querySelector('a[href*="://"]')) {
                  contentType = contentType === 'text' ? 'link' : `${contentType}+link`
                }
                
                // Log the post
                const postData = {
                  id: statusId,
                  account: { 
                    id: authorId,
                    username: authorName
                  },
                  content: contentElement?.innerHTML || '',
                  createdAt: new Date().toISOString(),
                  favouritesCount: favouritesCount,
                  reblogsCount: reblogsCount,
                  repliesCount: repliesCount,
                  contentType: contentType
                }
                
                console.log('Logging article:', postData)
                logPost(postData)
              } catch (error) {
                console.error('Error processing article:', error)
              }
            })
          }
        })
        
        // Start observing the entire document
        console.log('Starting DOM observer...')
        observer.observe(document.documentElement, { 
          childList: true, 
          subtree: true,
          attributes: false,
          characterData: false
        })
        
        // Add a container for message display
        const messageContainer = document.createElement('div')
        messageContainer.style.position = 'fixed'
        messageContainer.style.bottom = '70px'
        messageContainer.style.right = '20px'
        messageContainer.style.zIndex = '9999'
        messageContainer.style.padding = '10px'
        messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
        messageContainer.style.color = 'white'
        messageContainer.style.borderRadius = '5px'
        messageContainer.style.maxWidth = '300px'
        messageContainer.style.display = 'none'
        messageContainer.textContent = 'Timeline structure analyzed! Check browser console for details.'
        document.body.appendChild(messageContainer)
        
        // Show a message when debug button is clicked
        debugButton.addEventListener('click', () => {
          messageContainer.style.display = 'block'
          setTimeout(() => {
            messageContainer.style.display = 'none'
          }, 3000)
        })
      }, 2000) // Wait for the app to initialize
    }
  }
})